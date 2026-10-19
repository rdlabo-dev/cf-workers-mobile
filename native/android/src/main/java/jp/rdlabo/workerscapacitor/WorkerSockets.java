package jp.rdlabo.workerscapacitor;

import android.util.Base64;
import com.getcapacitor.JSObject;
import io.netty.bootstrap.Bootstrap;
import io.netty.buffer.ByteBuf;
import io.netty.buffer.Unpooled;
import io.netty.channel.*;
import io.netty.channel.nio.NioEventLoopGroup;
import io.netty.channel.socket.SocketChannel;
import io.netty.channel.socket.ChannelInputShutdownEvent;
import io.netty.channel.socket.nio.NioSocketChannel;
import io.netty.handler.ssl.SslHandler;
import java.util.ArrayDeque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import javax.net.ssl.*;

/** One bounded, independently half-closeable byte stream per JS socket. */
final class WorkerSockets {
    interface Result {
        void resolve(JSObject value);
        void reject(String message);
    }
    private final Map<String, Connection> connections = new ConcurrentHashMap<>();
    private EventLoopGroup group;
    private SSLContext tlsContext;
    private boolean stopped;
    private final class Connection extends SimpleChannelInboundHandler<ByteBuf> {
        final String id;
        final Result opening;
        final ArrayDeque<byte[]> chunks = new ArrayDeque<>();
        SocketChannel channel;
        Result reading, watching;
        int count, offset;
        boolean ready, closed, eof, ended, writing, reset;
        Connection(String id, Result opening) { this.id=id; this.opening=opening; }
        void fail(String message) {
            if (closed) return;
            closed=true;
            if (!ready) { ready=true; opening.reject(message); }
            if (reading!=null) {
                Result pending=reading; reading=null;
                // The pinned Workers transport reports peer reset as EOF.
                if(reset) { JSObject value=new JSObject(); value.put("eof",true); value.put("reset",true); pending.resolve(value); }
                else pending.reject(message);
            }
            if(watching!=null) { Result pending=watching; watching=null; if(reset) pending.resolve(null); else pending.reject(message); }
            chunks.clear();
            if(channel!=null) channel.close();
        }
        void notifyEnd() {
            if(eof && chunks.isEmpty() && watching!=null) { Result pending=watching; watching=null; pending.resolve(null); }
        }
        void pump() {
            if(!closed && !eof && chunks.isEmpty()) channel.read();
        }
        void drain() {
            if(reading==null) return;
            JSObject value=new JSObject();
            if(!chunks.isEmpty()) {
                byte[] chunk=chunks.peek(); int size=Math.min(count,chunk.length-offset);
                value.put("chunk",Base64.encodeToString(chunk,offset,size,Base64.NO_WRAP));
                offset+=size; if(offset==chunk.length) { chunks.remove(); offset=0; }
            } else if(eof) value.put("eof",true);
            else { pump(); return; }
            Result pending=reading; reading=null; pending.resolve(value); notifyEnd(); pump();
        }
        @Override protected void channelRead0(ChannelHandlerContext context,ByteBuf input) {
            if(closed || !input.isReadable()) return;
            byte[] chunk=new byte[input.readableBytes()]; input.readBytes(chunk); chunks.add(chunk); drain();
        }
        @Override public void channelReadComplete(ChannelHandlerContext context) { if(!ready && !closed) context.read(); else pump(); }
        @Override public void userEventTriggered(ChannelHandlerContext context,Object event) {
            if(event instanceof ChannelInputShutdownEvent) { eof=true; drain(); notifyEnd(); }
            else context.fireUserEventTriggered(event);
        }
        @Override public void channelInactive(ChannelHandlerContext context) {
            if(!closed) { eof=true; drain(); notifyEnd(); }
        }
        @Override public void exceptionCaught(ChannelHandlerContext context,Throwable error) {
            reset = error instanceof java.io.IOException && String.valueOf(error.getMessage()).toLowerCase(java.util.Locale.ROOT).contains("reset");
            fail("Socket failed: "+error.getMessage());
        }
    }
    synchronized void open(String id,String host,int port,boolean tls,Result result) {
        if(stopped || id==null || id.isEmpty() || connections.containsKey(id) || host==null || host.isEmpty() || port<1 || port>65535) { result.reject("Invalid socket open"); return; }
        try {
            final SSLEngine engine;
            if(tls) {
                // Android cannot resume HttpURLConnection's SSLSocket sessions in
                // an SSLEngine. Keep our session cache separate, using default trust.
                if(tlsContext==null) {
                    SSLContext context=SSLContext.getInstance("TLS");
                    context.init(null,null,null); tlsContext=context;
                }
                engine=tlsContext.createSSLEngine(host,port); engine.setUseClientMode(true);
                SSLParameters parameters=engine.getSSLParameters(); parameters.setEndpointIdentificationAlgorithm("HTTPS"); engine.setSSLParameters(parameters);
            } else engine=null;
            if(group==null) group=new NioEventLoopGroup(1);
            Connection connection=new Connection(id,result); connections.put(id,connection);
            ChannelFuture future=new Bootstrap().group(group).channel(NioSocketChannel.class)
                .option(ChannelOption.AUTO_READ,false).option(ChannelOption.ALLOW_HALF_CLOSURE,true)
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS,30000)
                .option(ChannelOption.RCVBUF_ALLOCATOR,new FixedRecvByteBufAllocator(65536).maxMessagesPerRead(1))
                .handler(new ChannelInitializer<SocketChannel>() {
                    @Override protected void initChannel(SocketChannel channel) {
                        connection.channel=channel;
                        if(engine!=null) channel.pipeline().addLast(new SslHandler(engine));
                        channel.pipeline().addLast(connection);
                    }
                }).connect(host,port);
            connection.channel=(SocketChannel)future.channel();
            future.addListener(connected -> {
                if(!connected.isSuccess()) { connection.fail("Socket connect failed: "+connected.cause()); return; }
                Runnable ready=() -> {
                    if(connection.closed) return;
                    connection.ready=true;
                    JSObject value=new JSObject();
                    value.put("localAddress",authority(connection.channel.localAddress()));
                    value.put("remoteAddress",authority(connection.channel.remoteAddress())); result.resolve(value);
                    connection.channel.read();
                };
                if(engine==null) ready.run();
                else { connection.channel.pipeline().get(SslHandler.class).handshakeFuture().addListener(handshake -> {
                    if(handshake.isSuccess()) ready.run(); else connection.fail("TLS failed: "+handshake.cause());
                }); connection.channel.read(); }
            });
        } catch(Exception error) { Connection connection=connections.remove(id); if(connection!=null) connection.fail(error.toString()); else result.reject(error.toString()); }
    }
    private static String authority(java.net.InetSocketAddress address) {
        String host=address.getAddress().getHostAddress(); return (host.contains(":")?"["+host+"]":host)+":"+address.getPort();
    }
    private void perform(String id,Result result,java.util.function.Consumer<Connection> action) { perform(id,result,false,action); }
    private synchronized void perform(String id,Result result,boolean allowReset,java.util.function.Consumer<Connection> action) {
        if(id==null) { result.reject("Missing socket handle"); return; }
        Connection connection=connections.get(id);
        if(connection==null) { result.reject("Unknown socket handle"); return; }
        connection.channel.eventLoop().execute(() -> {
            if((connection.closed && !(allowReset && connection.reset)) || !connection.ready) result.reject("Socket is not connected"); else action.accept(connection);
        });
    }
    void watch(String id,Result result) {
        perform(id,result,true,connection -> {
            if(connection.reset) { result.resolve(null); return; }
            if(connection.watching!=null) { result.reject("Socket watch already pending"); return; }
            connection.watching=result; connection.notifyEnd();
        });
    }
    void read(String id,int count,Result result) {
        if(count<1 || count>65536) { result.reject("Invalid socket read size"); return; }
        perform(id,result,true,connection -> {
            if(connection.reset) { JSObject value=new JSObject(); value.put("eof",true); value.put("reset",true); result.resolve(value); return; }
            if(connection.reading!=null) { result.reject("Socket read already pending"); return; }
            connection.reading=result; connection.count=count; connection.drain();
        });
    }
    void write(String id,String encoded,Result result) {
        if(encoded == null || encoded.length() > 87384) { result.reject("Invalid socket chunk size"); return; }
        final byte[] chunk;
        try { chunk=Base64.decode(encoded,Base64.DEFAULT); } catch(Exception error) { result.reject("Invalid socket chunk"); return; }
        if(chunk.length>65536) { result.reject("Socket chunk exceeds limit"); return; }
        perform(id,result,connection -> {
            if(connection.ended || connection.writing) { result.reject("Socket write unavailable"); return; }
            connection.writing=true;
            connection.channel.writeAndFlush(Unpooled.wrappedBuffer(chunk)).addListener(future -> {
                connection.writing=false;
                if(future.isSuccess()) result.resolve(null); else { result.reject("Socket write failed"); connection.fail("Socket write failed"); }
            });
        });
    }
    void end(String id,Result result) {
        perform(id,result,true,connection -> {
            if(connection.reset) { result.resolve(null); return; }
            if(connection.writing) { result.reject("Socket write still pending"); return; }
            if(connection.ended) { result.resolve(null); return; }
            connection.ended=true;
            connection.channel.shutdownOutput().addListener(future -> {
                if(future.isSuccess()) result.resolve(null); else { result.reject("Socket end failed"); connection.fail("Socket end failed"); }
            });
        });
    }
    synchronized void close(String id,Result result) {
        if(id==null) { result.reject("Missing socket handle"); return; }
        Connection connection=connections.remove(id);
        if(connection==null) { result.resolve(null); return; }
        connection.channel.eventLoop().execute(() -> { connection.fail("Socket closed"); connection.channel.close().addListener(future -> result.resolve(null)); });
    }
    synchronized void shutdown() {
        if(stopped) return; stopped=true;
        for(Connection connection:connections.values()) connection.channel.eventLoop().execute(() -> connection.fail("Socket runtime closed"));
        connections.clear(); if(group!=null) group.shutdownGracefully(0,2,TimeUnit.SECONDS);
    }
}
