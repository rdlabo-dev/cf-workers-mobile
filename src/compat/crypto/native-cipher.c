#include <emscripten.h>
#include <openssl/aead.h>
#include <openssl/cipher.h>
#include <openssl/err.h>
#include <openssl/ec.h>
#include <openssl/dh.h>
#include <openssl/bn.h>
#include <openssl/obj.h>
#include <openssl/mem.h>
#include <string.h>
#define API EMSCRIPTEN_KEEPALIVE
#define AEAD(name) if(!strcmp(algorithm,#name)) return EVP_aead_##name();
API const EVP_AEAD *cipher_aead(const char *algorithm) {
 AEAD(aes_128_gcm) AEAD(aes_192_gcm) AEAD(aes_256_gcm)
 AEAD(aes_128_eax) AEAD(aes_256_eax)
 AEAD(aes_128_ccm_matter) AEAD(aes_128_ccm_bluetooth) AEAD(aes_128_ccm_bluetooth_8)
 AEAD(aes_128_gcm_randnonce) AEAD(aes_256_gcm_randnonce)
 AEAD(aes_128_gcm_siv) AEAD(aes_256_gcm_siv)
 AEAD(aes_128_ctr_hmac_sha256) AEAD(aes_256_ctr_hmac_sha256)
 AEAD(xchacha20_poly1305) AEAD(chacha20_poly1305)
 return NULL;
}
API EVP_AEAD_CTX *cipher_aead_new(const EVP_AEAD *algorithm,const unsigned char *key,size_t size,size_t tag) {return EVP_AEAD_CTX_new(algorithm,key,size,tag);}
API void cipher_aead_free(EVP_AEAD_CTX *ctx) {EVP_AEAD_CTX_free(ctx);}
API int cipher_aead_seal(EVP_AEAD_CTX *ctx,unsigned char *out,unsigned char *tag,size_t *tag_size,size_t max_tag,const unsigned char *nonce,size_t nonce_size,const unsigned char *input,size_t size,const unsigned char *aad,size_t aad_size) {ERR_clear_error();return EVP_AEAD_CTX_seal_scatter(ctx,out,tag,tag_size,max_tag,nonce,nonce_size,input,size,NULL,0,aad,aad_size);}
API int cipher_aead_open(EVP_AEAD_CTX *ctx,unsigned char *out,const unsigned char *nonce,size_t nonce_size,const unsigned char *input,size_t size,const unsigned char *tag,size_t tag_size,const unsigned char *aad,size_t aad_size) {ERR_clear_error();return EVP_AEAD_CTX_open_gather(ctx,out,nonce,nonce_size,input,size,tag,tag_size,aad,aad_size);}
API int cipher_aead_info(const EVP_AEAD *a,int kind){return kind==0?EVP_AEAD_key_length(a):kind==1?EVP_AEAD_nonce_length(a):EVP_AEAD_max_overhead(a);}
API const EVP_CIPHER *cipher_lookup(const char *name){return EVP_get_cipherbyname(name);}
API EVP_CIPHER_CTX *cipher_new(void){return EVP_CIPHER_CTX_new();}
API void cipher_free(EVP_CIPHER_CTX *ctx){EVP_CIPHER_CTX_free(ctx);}
API int cipher_init(EVP_CIPHER_CTX *ctx,const EVP_CIPHER *cipher,const unsigned char *key,const unsigned char *iv,int encrypt){return EVP_CipherInit_ex(ctx,cipher,NULL,key,iv,encrypt);}
API int cipher_key_size(EVP_CIPHER_CTX *ctx,int size){return EVP_CIPHER_CTX_set_key_length(ctx,size);}
API int cipher_padding(EVP_CIPHER_CTX *ctx,int padding){return EVP_CIPHER_CTX_set_padding(ctx,padding);}
API int cipher_iv_size(EVP_CIPHER_CTX *ctx,int size){return EVP_CIPHER_CTX_ctrl(ctx,EVP_CTRL_AEAD_SET_IVLEN,size,NULL);}
API int cipher_tag(EVP_CIPHER_CTX *ctx,int get,int size,unsigned char *data){return EVP_CIPHER_CTX_ctrl(ctx,get?EVP_CTRL_AEAD_GET_TAG:EVP_CTRL_AEAD_SET_TAG,size,data);}
API int cipher_update(EVP_CIPHER_CTX *ctx,unsigned char *out,int *size,const unsigned char *data,int length){return EVP_CipherUpdate(ctx,out,size,data,length);}
API int cipher_final(EVP_CIPHER_CTX *ctx,unsigned char *out,int *size){return EVP_CipherFinal_ex(ctx,out,size);}
API unsigned long cipher_error(void){return ERR_get_error();}
API const char *cipher_reason(unsigned long code){return ERR_reason_error_string(code);}
API int cipher_info(const EVP_CIPHER *cipher,int kind){return kind==0?EVP_CIPHER_key_length(cipher):kind==1?EVP_CIPHER_iv_length(cipher):kind==2?EVP_CIPHER_block_size(cipher):EVP_CIPHER_mode(cipher);}

API int cipher_bad_decrypt(void){uint32_t code=ERR_peek_last_error();int result=ERR_GET_LIB(code)==ERR_LIB_CIPHER && ERR_GET_REASON(code)==CIPHER_R_BAD_DECRYPT;ERR_clear_error();return result;}

API intptr_t cipher_curve_name(const char *name){
 int nid=EC_curve_nist2nid(name);if(nid==NID_undef)nid=OBJ_sn2nid(name);
 if(nid==NID_undef)return 0;EC_GROUP *group=EC_GROUP_new_by_curve_name(nid);if(!group)return -1;
 EC_GROUP_free(group);return (intptr_t)OBJ_nid2sn(nid);
}

API int cipher_dh_generate(const unsigned char *prime,int length,unsigned long generator,unsigned char *out){
 DH *dh=DH_new();BIGNUM *p=BN_bin2bn(prime,length,NULL),*g=BN_new();int ok=0;
 if(!dh || !p || !g || !BN_set_word(g,generator) || !DH_set0_pqg(dh,p,NULL,g))goto done;
 p=NULL;g=NULL;if(!DH_generate_key(dh))goto done;
 const BIGNUM *pub,*priv;DH_get0_key(dh,&pub,&priv);
 ok=BN_bn2bin_padded(out,length,pub) && BN_bn2bin_padded(out+length,length,priv);
 done: BN_free(p);BN_free(g);DH_free(dh);return ok;
}
API int cipher_dh_derive(const unsigned char *prime,int plen,const unsigned char *generator,int glen,const unsigned char *priv,int xlen,const unsigned char *pub,int ylen,unsigned char *out){
 DH *dh=DH_new();BIGNUM *p=BN_bin2bn(prime,plen,NULL),*g=BN_bin2bn(generator,glen,NULL),*x=BN_bin2bn(priv,xlen,NULL),*y=BN_bin2bn(pub,ylen,NULL);int result=-1;
 if(!dh || !p || !g || !x || !y || !DH_set0_pqg(dh,p,NULL,g))goto done;
 p=NULL;g=NULL;if(!DH_set0_key(dh,NULL,x))goto done;x=NULL;
 result=DH_compute_key_padded(out,y,dh);
 done: BN_free(p);BN_free(g);BN_clear_free(x);BN_free(y);DH_free(dh);return result;
}

API DH *dh_create(const unsigned char *prime,int plen,const unsigned char *generator,int glen){
 DH *dh=DH_new();BIGNUM *p=BN_bin2bn(prime,plen,NULL),*g=BN_bin2bn(generator,glen,NULL);
 if(!dh || !p || !g || !DH_set0_pqg(dh,p,NULL,g)){DH_free(dh);BN_free(p);BN_free(g);return NULL;}return dh;
}
API DH *dh_parameters(int bits,int generator){
 DH *dh=DH_new();if(!dh || !DH_generate_parameters_ex(dh,bits,generator,NULL)){DH_free(dh);return NULL;}return dh;
}
API DH *dh_group(int bits){
 BIGNUM *p=bits==2048?BN_get_rfc3526_prime_2048(NULL):bits==3072?BN_get_rfc3526_prime_3072(NULL):bits==4096?BN_get_rfc3526_prime_4096(NULL):bits==6144?BN_get_rfc3526_prime_6144(NULL):bits==8192?BN_get_rfc3526_prime_8192(NULL):NULL;
 BIGNUM *g=BN_new();DH *dh=DH_new();if(!p || !g || !dh || !BN_set_word(g,2) || !DH_set0_pqg(dh,p,NULL,g)){BN_free(p);BN_free(g);DH_free(dh);return NULL;}return dh;
}
API void dh_free(DH *dh){DH_free(dh);}
API int dh_check(DH *dh){int code=0;return DH_check(dh,&code)?code:-1;}
API int dh_generate(DH *dh){return DH_generate_key(dh);}
API int dh_get(DH *dh,int kind,unsigned char *out){
 const BIGNUM *bn=kind==0?DH_get0_p(dh):kind==1?DH_get0_g(dh):kind==2?DH_get0_pub_key(dh):DH_get0_priv_key(dh);
 if(!bn)return -1;int length=BN_num_bytes(bn);if(out && !BN_bn2bin_padded(out,length,bn))return -1;return length;
}
API int dh_set(DH *dh,int private_key,const unsigned char *key,int length){
 BIGNUM *bn=BN_bin2bn(key,length,NULL);if(!bn)return -1;
 if(!private_key){int code=0;if(!DH_check_pub_key(dh,bn,&code)){BN_free(bn);return -1;}if(code){BN_free(bn);return code;}}
 int ok=DH_set0_key(dh,private_key?NULL:bn,private_key?bn:NULL);if(!ok)BN_clear_free(bn);return ok?0:-1;
}
API int dh_peer_check(DH *dh,const unsigned char *key,int length){
 BIGNUM *bn=BN_bin2bn(key,length,NULL);int code=0;int ok=bn && DH_check_pub_key(dh,bn,&code);BN_free(bn);return ok?code:-1;
}
API int dh_compute(DH *dh,const unsigned char *key,int length,unsigned char *out){
 BIGNUM *bn=BN_bin2bn(key,length,NULL);if(!bn)return -1;int size=DH_compute_key_padded(out,bn,dh);BN_free(bn);return size;
}
API int dh_valid(DH *dh){return BN_is_odd(DH_get0_p(dh)) && BN_ucmp(DH_get0_g(dh),DH_get0_p(dh))<0;}

API int dh_group_check(DH *dh){return BN_mod_word(DH_get0_p(dh),24)==11?0:DH_NOT_SUITABLE_GENERATOR;}
