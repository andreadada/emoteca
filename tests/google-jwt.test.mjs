import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {verifyGoogleJwt} from '../server/user-api.mjs';

const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'unit-key',alg:'RS256',use:'sig'};
const audience='fake-client-id.apps.googleusercontent.com';
const now=1800000000;
const base={iss:'https://accounts.google.com',aud:audience,exp:now+3600,iat:now,
  sub:'123456789012345678901',email:'person@example.com',email_verified:true,name:'Test person'};
function jwt(payload,header={alg:'RS256',typ:'JWT',kid:'unit-key'}){
  const parts=[header,payload].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url'));
  const signature=sign('RSA-SHA256',Buffer.from(parts.join('.')),privateKey).toString('base64url');
  return parts.join('.')+'.'+signature;
}
test('Google ID token verifies signature, audience, expiry, issuer and subject',()=>{
  const user=verifyGoogleJwt(jwt(base),[jwk],audience,now);
  assert.deepEqual(user,{sub:base.sub,email:base.email,name:base.name,picture:''});
});
test('Reject incorrect audience, expiration, issuer, unsigned JWTs and unverified email',()=>{
  for(const payload of [
    {...base,aud:'wrong-app'}, {...base,exp:now-1},{...base,iat:now+120},
    {...base,iss:'https://attacker.example.com'}, {...base,email_verified:false},
    {...base,sub:'../../another-user'}, {...base,email:null}
  ])assert.throws(()=>verifyGoogleJwt(jwt(payload),[jwk],audience,now),/Identità Google non verificata/);
  assert.throws(()=>verifyGoogleJwt(jwt(base,{alg:'none',typ:'JWT',kid:'unit-key'}),[jwk],audience,now),/Firma Google non valida/);
  assert.throws(()=>verifyGoogleJwt(jwt(base),[jwk],audience,now+5000),/Identità Google non verificata/);
  assert.throws(()=>verifyGoogleJwt(jwt(base),[],audience,now),/Chiave Google non riconosciuta/);
  const good=jwt(base),parts=good.split('.');
  parts[1]=Buffer.from(JSON.stringify({...base,sub:'987654321'})).toString('base64url');
  assert.throws(()=>verifyGoogleJwt(parts.join('.'),[jwk],audience,now),/Identità Google non verificata/);
});
