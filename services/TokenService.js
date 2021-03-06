const { decodeJWT, verifyJWT } = require("did-jwt");
const { Resolver } = require("did-resolver");
const { getResolver } = require("ethr-did-resolver");
const Messages = require("../constants/Messages");
const { SERVER_DID } = require("../constants/Constants");
const {
	BLOCKCHAIN: { BLOCK_CHAIN_URL, BLOCK_CHAIN_CONTRACT }
} = require("../constants/Constants");
const { EXPIRED, INVALID_CODE, EXPIRED_CODE } = Messages.TOKEN;

const resolver = new Resolver(getResolver({ rpcUrl: BLOCK_CHAIN_URL, registry: BLOCK_CHAIN_CONTRACT }));

const serverDid = `did:ethr:${SERVER_DID}`;

const errorMessages = {
	TokenExpiredError: EXPIRED_CODE()
};

// validates the token and returns userId
const getTokenData = async token => {
	try {
		const decoded = await decodeJWT(token);
		if (!decoded) {
			throw INVALID();
		}

		return decoded;
	} catch (err) {
		console.log(err);

		if (err.name == "TokenExpiredError") {
			throw EXPIRED();
		}
		if (err.name == "JsonWebTokenError") {
			throw INVALID();
		}
		throw { name: err.name, message: err.message };
	}
};

const getPayload = jwt => {
	const { payload } = decodeJWT(jwt);
	return payload;
};

const verifyToken = async (jwt, isUser = false) => {
	const options = {
		resolver,
		audience: serverDid
	};
	try {
		return await verifyJWT(jwt, options);
	} catch (error) {
		const message = errorMessages[error.name] || INVALID_CODE(isUser);
		throw message;
	}
};

module.exports = {
	getPayload,
	getTokenData,
	verifyToken
};
