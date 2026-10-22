// OpenSSL bridge owned by cf-workers-native (MIT).
#include <emscripten/emscripten.h>
#include <openssl/evp.h>
#include <openssl/pem.h>
#include <openssl/rsa.h>
#include <openssl/ec.h>
#include <openssl/ecdsa.h>
#include <openssl/err.h>
#include <openssl/provider.h>
#include <openssl/core_names.h>
#include <openssl/bn.h>
#include <stdlib.h>
#include <string.h>
#define API EMSCRIPTEN_KEEPALIVE
static unsigned char *output;
static size_t output_length;
static void clear_output(void) { OPENSSL_clear_free(output, output_length); output=NULL; output_length=0; }
static int save_bio(BIO *bio) {
  char *data; long size=BIO_get_mem_data(bio,&data);
  if(size<0) return 0;
  clear_output(); output=OPENSSL_memdup(data,(size_t)size);output_length=(size_t)size;
  return output != NULL;
}
API int wk_init(void) { return OPENSSL_init_crypto(OPENSSL_INIT_NO_LOAD_CONFIG,NULL); }
API void wk_output_clear(void) { clear_output(); }
API void *wk_output(void) { return output; }
API size_t wk_output_length(void) { return output_length; }
API unsigned long wk_error(void) { return ERR_get_error(); }
API const char *wk_error_reason(unsigned long error) { return ERR_reason_error_string(error); }
API int wk_equal(const void *a,const void *b,size_t size) { return CRYPTO_memcmp(a,b,size)==0; }
struct password_input {const unsigned char *bytes;int length;};
static int password_callback(char *buffer,int size,int writing,void *opaque) {
  (void)writing;struct password_input *password=opaque;
  if(!password || password->length>size)return -1;
  if(password->length)memcpy(buffer,password->bytes,password->length);
  return password->length;
}
API EVP_PKEY *wk_key_parse(const unsigned char *data,int size,int pem,int private_key,const unsigned char *password,int password_length) {
  ERR_clear_error(); BIO *bio=BIO_new_mem_buf(data,size); if(!bio)return NULL;
  struct password_input pass={password,password_length};
  EVP_PKEY *key=NULL;
  if(pem) {
    key=private_key?PEM_read_bio_PrivateKey(bio,NULL,password_callback,&pass):PEM_read_bio_PUBKEY(bio,NULL,NULL,NULL);
  } else {
    const unsigned char *cursor=data;
    key=private_key?d2i_AutoPrivateKey(NULL,&cursor,size):d2i_PUBKEY(NULL,&cursor,size);
    if(!key && private_key) { ERR_clear_error();BIO_reset(bio);key=d2i_PKCS8PrivateKey_bio(bio,NULL,password_callback,&pass); }
    if(!key && !private_key) { cursor=data; RSA *rsa=d2i_RSAPublicKey(NULL,&cursor,size);if(rsa){key=EVP_PKEY_new();if(!key || !EVP_PKEY_assign_RSA(key,rsa)){RSA_free(rsa);EVP_PKEY_free(key);key=NULL;}} }
  }
  BIO_free(bio);return key;
}
API void wk_key_free(EVP_PKEY *key) { EVP_PKEY_free(key); }
API const char *wk_key_type(EVP_PKEY *key) { return EVP_PKEY_get0_type_name(key); }
API int wk_key_bits(EVP_PKEY *key) { return EVP_PKEY_get_bits(key); }
API int wk_key_equal(EVP_PKEY *a,EVP_PKEY *b) { return EVP_PKEY_eq(a,b); }
API int wk_key_export(EVP_PKEY *key,int private_key,int pem,int type,const char *cipher_name,const char *password,int password_length) {
  ERR_clear_error();BIO *bio=BIO_new(BIO_s_mem());if(!bio)return 0;
  const EVP_CIPHER *cipher=cipher_name && *cipher_name?EVP_get_cipherbyname(cipher_name):NULL;
  if(cipher_name && *cipher_name && !cipher){BIO_free(bio);return 0;}
  int ok=0;
  if(private_key) {
    if(type==0) ok=pem?PEM_write_bio_PKCS8PrivateKey(bio,key,cipher,(char *)password,password_length,NULL,NULL):i2d_PKCS8PrivateKey_bio(bio,key,cipher,(char *)password,password_length,NULL,NULL);
    else if(type==1) {RSA *rsa=EVP_PKEY_get1_RSA(key);if(rsa){ok=pem?PEM_write_bio_RSAPrivateKey(bio,rsa,cipher,(const unsigned char *)password,password_length,NULL,NULL):i2d_RSAPrivateKey_bio(bio,rsa);RSA_free(rsa);}}
    else if(type==2) {EC_KEY *ec=EVP_PKEY_get1_EC_KEY(key);if(ec){ok=pem?PEM_write_bio_ECPrivateKey(bio,ec,cipher,(const unsigned char *)password,password_length,NULL,NULL):i2d_ECPrivateKey_bio(bio,ec);EC_KEY_free(ec);}}
  } else {
    if(type==1) {RSA *rsa=EVP_PKEY_get1_RSA(key);if(rsa){ok=pem?PEM_write_bio_RSAPublicKey(bio,rsa):i2d_RSAPublicKey_bio(bio,rsa);RSA_free(rsa);}}
    else ok=pem?PEM_write_bio_PUBKEY(bio,key):i2d_PUBKEY_bio(bio,key);
  }
  if(ok)ok=save_bio(bio);BIO_free(bio);return ok;
}
API EVP_PKEY *wk_key_generate(const char *type,int bits,const char *curve,unsigned long exponent) {
  ERR_clear_error();EVP_PKEY_CTX *ctx=EVP_PKEY_CTX_new_from_name(NULL,type,NULL);if(!ctx)return NULL;
  EVP_PKEY *key=NULL;int ok=EVP_PKEY_keygen_init(ctx)>0;
  if(ok && (!strcmp(type,"RSA") || !strcmp(type,"RSA-PSS")))ok=EVP_PKEY_CTX_set_rsa_keygen_bits(ctx,bits)>0;
  if(ok && (!strcmp(type,"RSA") || !strcmp(type,"RSA-PSS"))) { BIGNUM *e=BN_new();ok=e && BN_set_word(e,exponent) && EVP_PKEY_CTX_set1_rsa_keygen_pubexp(ctx,e)>0;BN_free(e); }
  if(ok && (!strcmp(type,"EC") || !strcmp(type,"DH")))ok=EVP_PKEY_CTX_set_group_name(ctx,curve)>0;
  if(ok)ok=EVP_PKEY_generate(ctx,&key)>0;
  EVP_PKEY_CTX_free(ctx);if(!ok){EVP_PKEY_free(key);return NULL;}return key;
}
static int signature_width(EVP_PKEY *key) {
  if(EVP_PKEY_is_a(key,"EC"))return (EVP_PKEY_get_bits(key)+7)/8;
  if(EVP_PKEY_is_a(key,"DSA")){BIGNUM *q=NULL;if(!EVP_PKEY_get_bn_param(key,OSSL_PKEY_PARAM_FFC_Q,&q))return 0;int size=BN_num_bytes(q);BN_free(q);return size;}
  return 0;
}
API int wk_sign(EVP_PKEY *key,const char *digest,const unsigned char *data,size_t length,int padding,int saltlen,int p1363) {
  ERR_clear_error();EVP_MD_CTX *ctx=EVP_MD_CTX_new();if(!ctx)return 0;EVP_PKEY_CTX *pctx=NULL;
  int ok=EVP_DigestSignInit_ex(ctx,&pctx,digest && *digest?digest:NULL,NULL,NULL,key,NULL)>0;
  if(ok && padding)ok=EVP_PKEY_CTX_set_rsa_padding(pctx,padding)>0;
  if(ok && padding==RSA_PKCS1_PSS_PADDING)ok=EVP_PKEY_CTX_set_rsa_pss_saltlen(pctx,saltlen)>0;
  size_t size=0;if(ok)ok=EVP_DigestSign(ctx,NULL,&size,data,length)>0;
  clear_output();if(ok){output=OPENSSL_malloc(size);output_length=size;ok=output && EVP_DigestSign(ctx,output,&output_length,data,length)>0;}
  if(ok && p1363 && signature_width(key)) {
    int width=signature_width(key);const unsigned char *cursor=output;ECDSA_SIG *signature=d2i_ECDSA_SIG(NULL,&cursor,output_length);
    unsigned char *raw=OPENSSL_malloc(2*width);const BIGNUM *r,*s;
    if(!signature || !raw)ok=0;
    else {ECDSA_SIG_get0(signature,&r,&s);ok=BN_bn2binpad(r,raw,width)==width && BN_bn2binpad(s,raw+width,width)==width;}
    ECDSA_SIG_free(signature);clear_output();if(ok){output=raw;output_length=2*width;}else OPENSSL_clear_free(raw,2*width);
  }
  EVP_MD_CTX_free(ctx);return ok;
}
API int wk_verify(EVP_PKEY *key,const char *digest,const unsigned char *data,size_t length,const unsigned char *signature,size_t signature_length,int padding,int saltlen,int p1363) {
  ERR_clear_error();EVP_MD_CTX *ctx=EVP_MD_CTX_new();if(!ctx)return -1;EVP_PKEY_CTX *pctx=NULL;
  int ok=EVP_DigestVerifyInit_ex(ctx,&pctx,digest && *digest?digest:NULL,NULL,NULL,key,NULL)>0;
  if(ok && padding)ok=EVP_PKEY_CTX_set_rsa_padding(pctx,padding)>0;
  if(ok && padding==RSA_PKCS1_PSS_PADDING)ok=EVP_PKEY_CTX_set_rsa_pss_saltlen(pctx,saltlen)>0;
  unsigned char *converted=NULL;
  if(ok && p1363 && signature_width(key)) {
    int width=signature_width(key);
    if(signature_length!=(size_t)(2*width)){EVP_MD_CTX_free(ctx);return 0;}
    ECDSA_SIG *value=ECDSA_SIG_new();BIGNUM *r=BN_bin2bn(signature,width,NULL),*s=BN_bin2bn(signature+width,width,NULL);
    if(!value || !r || !s || !ECDSA_SIG_set0(value,r,s)){ECDSA_SIG_free(value);BN_free(r);BN_free(s);EVP_MD_CTX_free(ctx);return -1;}
    int length=i2d_ECDSA_SIG(value,&converted);ECDSA_SIG_free(value);if(length<=0){EVP_MD_CTX_free(ctx);return -1;}
    signature=converted;signature_length=(size_t)length;
  }
  int result=ok?EVP_DigestVerify(ctx,signature,signature_length,data,length):-1;OPENSSL_free(converted);EVP_MD_CTX_free(ctx);return result;
}

API int wk_derive(EVP_PKEY *key,EVP_PKEY *peer) {
  ERR_clear_error();EVP_PKEY_CTX *ctx=EVP_PKEY_CTX_new(key,NULL);if(!ctx)return 0;
  size_t size=0;int ok=EVP_PKEY_derive_init(ctx)>0 && EVP_PKEY_derive_set_peer(ctx,peer)>0 && EVP_PKEY_derive(ctx,NULL,&size)>0;
  clear_output();if(ok){output=OPENSSL_malloc(size);output_length=size;ok=output && EVP_PKEY_derive(ctx,output,&output_length)>0;}
  EVP_PKEY_CTX_free(ctx);return ok;
}
API int wk_key_parameter(EVP_PKEY *key,const char *name) {
  ERR_clear_error();BIGNUM *bn=NULL;if(!EVP_PKEY_get_bn_param(key,name,&bn))return 0;
  clear_output();output_length=BN_num_bytes(bn);output=OPENSSL_malloc(output_length?output_length:1);
  int ok=output!=NULL;if(ok)BN_bn2bin(bn,output);BN_clear_free(bn);return ok;
}
API int wk_key_group(EVP_PKEY *key) {
  char name[100];size_t size=0;if(!EVP_PKEY_get_utf8_string_param(key,OSSL_PKEY_PARAM_GROUP_NAME,name,sizeof(name),&size))return 0;
  clear_output();output=(unsigned char *)OPENSSL_strdup(name);output_length=size;return output!=NULL;
}
API int wk_key_raw(EVP_PKEY *key,int private_key) {
  size_t size=0;int ok=private_key?EVP_PKEY_get_raw_private_key(key,NULL,&size):EVP_PKEY_get_raw_public_key(key,NULL,&size);
  clear_output();if(ok){output=OPENSSL_malloc(size);output_length=size;ok=output && (private_key?EVP_PKEY_get_raw_private_key(key,output,&output_length):EVP_PKEY_get_raw_public_key(key,output,&output_length));}return ok;
}
API int wk_prime_check(const unsigned char *data,int length,int checks) {
  ERR_clear_error();BIGNUM *value=BN_bin2bn(data,length,NULL);BN_CTX *ctx=BN_CTX_new();
  int result=value && ctx?BN_is_prime_ex(value,checks,ctx,NULL):-1;BN_clear_free(value);BN_CTX_free(ctx);return result;
}
API int wk_prime_generate(int bits,int safe,const unsigned char *add,int add_length,const unsigned char *rem,int rem_length) {
  ERR_clear_error();BIGNUM *a=add?BN_bin2bn(add,add_length,NULL):NULL,*r=rem?BN_bin2bn(rem,rem_length,NULL):NULL,*prime=BN_new();BN_CTX *ctx=BN_CTX_new();
  int ok=prime && ctx && (!add || a) && (!rem || r) && BN_generate_prime_ex2(prime,bits,safe,a,r,NULL,ctx);
  clear_output();if(ok){output_length=BN_num_bytes(prime);output=OPENSSL_malloc(output_length?output_length:1);ok=output!=NULL;if(ok)BN_bn2bin(prime,output);}
  BN_clear_free(a);BN_clear_free(r);BN_clear_free(prime);BN_CTX_free(ctx);return ok;
}
API EVP_MD_CTX *wk_digest_new(const char *algorithm) {
  ERR_clear_error();const EVP_MD *md=EVP_get_digestbyname(algorithm);EVP_MD_CTX *ctx=EVP_MD_CTX_new();
  if(!md || !ctx || EVP_DigestInit_ex(ctx,md,NULL)!=1){EVP_MD_CTX_free(ctx);return NULL;}return ctx;
}
API void wk_digest_free(EVP_MD_CTX *ctx) {EVP_MD_CTX_free(ctx);}
API int wk_digest_update(EVP_MD_CTX *ctx,const unsigned char *data,size_t length) {return EVP_DigestUpdate(ctx,data,length);}
API int wk_digest_final(EVP_MD_CTX *ctx) {
  unsigned int length=EVP_MAX_MD_SIZE;clear_output();output=OPENSSL_malloc(length);if(!output)return 0;
  output_length=length;if(EVP_DigestFinal_ex(ctx,output,&length)!=1){clear_output();return 0;}output_length=length;return 1;
}
API int wk_sign_hash(EVP_PKEY *key,const char *digest,const unsigned char *data,size_t length,int padding,int saltlen) {
  ERR_clear_error();EVP_PKEY_CTX *ctx=EVP_PKEY_CTX_new(key,NULL);if(!ctx)return 0;
  int ok=EVP_PKEY_sign_init(ctx)>0 && EVP_PKEY_CTX_set_signature_md(ctx,EVP_get_digestbyname(digest))>0;
  if(ok && padding)ok=EVP_PKEY_CTX_set_rsa_padding(ctx,padding)>0;
  if(ok && padding==RSA_PKCS1_PSS_PADDING)ok=EVP_PKEY_CTX_set_rsa_pss_saltlen(ctx,saltlen)>0;
  size_t size=0;if(ok)ok=EVP_PKEY_sign(ctx,NULL,&size,data,length)>0;
  clear_output();if(ok){output=OPENSSL_malloc(size);output_length=size;ok=output && EVP_PKEY_sign(ctx,output,&output_length,data,length)>0;}EVP_PKEY_CTX_free(ctx);return ok;
}
API int wk_verify_hash(EVP_PKEY *key,const char *digest,const unsigned char *data,size_t length,const unsigned char *signature,size_t signature_length,int padding,int saltlen) {
  ERR_clear_error();EVP_PKEY_CTX *ctx=EVP_PKEY_CTX_new(key,NULL);if(!ctx)return -1;
  int ok=EVP_PKEY_verify_init(ctx)>0 && EVP_PKEY_CTX_set_signature_md(ctx,EVP_get_digestbyname(digest))>0;
  if(ok && padding)ok=EVP_PKEY_CTX_set_rsa_padding(ctx,padding)>0;
  if(ok && padding==RSA_PKCS1_PSS_PADDING)ok=EVP_PKEY_CTX_set_rsa_pss_saltlen(ctx,saltlen)>0;
  int result=ok?EVP_PKEY_verify(ctx,signature,signature_length,data,length):-1;EVP_PKEY_CTX_free(ctx);return result;
}
API EC_KEY *wk_ec_new(const char *curve) {return EC_KEY_new_by_curve_name(OBJ_sn2nid(curve));}
API void wk_ec_free(EC_KEY *key) {EC_KEY_free(key);}
API int wk_ec_generate(EC_KEY *key) {return EC_KEY_generate_key(key);}
API int wk_ec_set_private(EC_KEY *key,const unsigned char *data,int length) {
 const EC_GROUP *group=EC_KEY_get0_group(key);BIGNUM *private=BN_bin2bn(data,length,NULL),*order=BN_new();EC_POINT *point=EC_POINT_new(group);
 int ok=private && order && point && EC_GROUP_get_order(group,order,NULL) && !BN_is_zero(private) && BN_cmp(private,order)<0;
 if(ok)ok=EC_POINT_mul(group,point,private,NULL,NULL,NULL) && EC_KEY_set_private_key(key,private) && EC_KEY_set_public_key(key,point);
 BN_clear_free(private);BN_free(order);EC_POINT_free(point);return ok;
}
static int save_point(const EC_GROUP *group,const EC_POINT *point,int format) {
 clear_output();size_t size=EC_POINT_point2oct(group,point,format,NULL,0,NULL);if(!size)return 0;
 output=OPENSSL_malloc(size);output_length=size;return output && EC_POINT_point2oct(group,point,format,output,size,NULL)==size;
}
API int wk_ec_public(EC_KEY *key,int format) {const EC_POINT *point=EC_KEY_get0_public_key(key);return point && save_point(EC_KEY_get0_group(key),point,format);}
API int wk_ec_private(EC_KEY *key) {
 const BIGNUM *private=EC_KEY_get0_private_key(key);if(!private)return 0;clear_output();output_length=BN_num_bytes(private);output=OPENSSL_malloc(output_length);return output && BN_bn2bin(private,output)==output_length;
}
API int wk_ec_secret(EC_KEY *key,const unsigned char *data,size_t length) {
 if(EC_KEY_check_key(key)!=1)return -2;const EC_GROUP *group=EC_KEY_get0_group(key);EC_POINT *point=EC_POINT_new(group);
 if(!point || !EC_POINT_oct2point(group,point,data,length,NULL) || EC_POINT_is_at_infinity(group,point) || EC_POINT_is_on_curve(group,point,NULL)!=1){EC_POINT_free(point);return -3;}
 clear_output();output_length=(EC_GROUP_get_degree(group)+7)/8;output=OPENSSL_malloc(output_length);int ok=output && ECDH_compute_key(output,output_length,point,key,NULL)>0;EC_POINT_free(point);return ok;
}
API int wk_ec_convert(EC_KEY *key,const unsigned char *data,size_t length,int format) {
 const EC_GROUP *group=EC_KEY_get0_group(key);EC_POINT *point=EC_POINT_new(group);
 int ok=point && EC_POINT_oct2point(group,point,data,length,NULL) && save_point(group,point,format);EC_POINT_free(point);return ok;
}
API int wk_rsa(EVP_PKEY *key,int operation,const unsigned char *data,size_t length,int padding,const char *hash,const unsigned char *label,size_t label_length,int has_label) {
 ERR_clear_error();EVP_PKEY_CTX *ctx=EVP_PKEY_CTX_new(key,NULL);if(!ctx)return -1;
 int initialized=operation==0?EVP_PKEY_encrypt_init(ctx):operation==1?EVP_PKEY_decrypt_init(ctx):operation==2?EVP_PKEY_sign_init(ctx):EVP_PKEY_verify_recover_init(ctx);
 int status=-1;if(initialized<=0)goto done;
 const EVP_MD *digest=NULL;
 if(operation<2){digest=EVP_get_digestbyname(hash);if(!digest){status=-2;goto done;}}
 if(EVP_PKEY_CTX_set_rsa_padding(ctx,padding)<=0){status=-3;goto done;}
 if(digest && padding==RSA_PKCS1_OAEP_PADDING){
  if(EVP_PKEY_CTX_set_rsa_oaep_md(ctx,digest)!=1){status=-4;goto done;}
  if(EVP_PKEY_CTX_set_rsa_mgf1_md(ctx,digest)!=1){status=-5;goto done;}
 }
 if(operation<2 && has_label){if(padding!=RSA_PKCS1_OAEP_PADDING){status=-6;goto done;}unsigned char *copy=OPENSSL_malloc(label_length?label_length:1);if(!copy){status=-6;goto done;}if(label_length)memcpy(copy,label,label_length);
  if(EVP_PKEY_CTX_set0_rsa_oaep_label(ctx,copy,label_length)!=1){OPENSSL_free(copy);status=-6;goto done;}
 }
 int (*cipher)(EVP_PKEY_CTX*,unsigned char*,size_t*,const unsigned char*,size_t)=operation==0?EVP_PKEY_encrypt:operation==1?EVP_PKEY_decrypt:operation==2?EVP_PKEY_sign:EVP_PKEY_verify_recover;
 size_t size=0;if(cipher(ctx,NULL,&size,data,length)!=1){status=-7;goto done;}
 clear_output();output=OPENSSL_malloc(size?size:1);output_length=size;
 if(!output || cipher(ctx,output,&output_length,data,length)!=1){clear_output();status=-8;goto done;}
 status=1;
 done: EVP_PKEY_CTX_free(ctx);return status;
}
API int wk_spkac(const unsigned char *data,int length,int operation) {
 while(length>0 && (data[length-1]==' ' || data[length-1]=='\n' || data[length-1]=='\r' || data[length-1]=='\t'))length--;
 if(!length)return 0;
 NETSCAPE_SPKI *spki=NETSCAPE_SPKI_b64_decode((const char*)data,length);if(!spki)return 0;
 int ok=0;EVP_PKEY *key=NULL;BIO *bio=NULL;
 if(operation==2){
  const ASN1_IA5STRING *challenge=spki->spkac->challenge;clear_output();output_length=ASN1_STRING_length(challenge);output=OPENSSL_malloc(output_length?output_length:1);
  if(output){memcpy(output,ASN1_STRING_get0_data(challenge),output_length);ok=1;}
 } else {
  key=NETSCAPE_SPKI_get_pubkey(spki);
  if(key && operation==1){bio=BIO_new(BIO_s_mem());ok=bio && PEM_write_bio_PUBKEY(bio,key) && save_bio(bio);}
  // Workers' FIPS backend rejects MD5 signatures. This is an API behavior
  // restriction, not a claim that the bundled OpenSSL build is FIPS certified.
  else if(key && OBJ_obj2nid(spki->sig_algor.algorithm)!=NID_md5WithRSAEncryption)ok=NETSCAPE_SPKI_verify(spki,key)==1;
 }
 BIO_free(bio);EVP_PKEY_free(key);NETSCAPE_SPKI_free(spki);return ok;
}
