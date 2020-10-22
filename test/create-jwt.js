const didJWT = require("did-jwt");

// wallet with tokens for testing purposes
const ISSUER_SERVER_DID = "did:ethr:0x3ce787e8bec093b282a6438f2aa3241d6754646a";
const ISSUER_SERVER_PRIVATE_KEY = "748ebb0b11bd204994db36857c7e89fea903ab579c1145a4a5fc10f041abdb9e";

const signer = didJWT.SimpleSigner(ISSUER_SERVER_PRIVATE_KEY);

async function logCreateJWT() {
	const response = await didJWT.createJWT(
		{ exp: 1957463421 },
		{ alg: "ES256K-R", issuer: ISSUER_SERVER_DID, signer }
		);
		console.log('JWT:');
		console.log(JSON.stringify(response));
		console.log('');
		console.log('JWT decodificado:');
		console.log(didJWT.decodeJWT(response));
}

logCreateJWT();