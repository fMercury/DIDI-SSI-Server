const Constants = require("../constants/Constants");
const { delegateTypes } = require("ethr-did-resolver");
// const regName = delegateTypes.Secp256k1VerificationKey2018;
const regName = delegateTypes.Secp256k1SignatureAuthentication2018;

const Messages = require("../constants/Messages");

const DidRegistryContract = require("ethr-did-registry");
var Tx = require("ethereumjs-tx");

var Web3 = require("web3");
const provider = new Web3.providers.HttpProvider(Constants.BLOCKCHAIN.BLOCK_CHAIN_URL);
const web3 = new Web3(provider);

// obtiene el contrato (ethr-did-registry)
const getContract = function(credentials) {
	return new web3.eth.Contract(DidRegistryContract.abi, Constants.BLOCKCHAIN.BLOCK_CHAIN_CONTRACT, {
		from: credentials.from,
		gasLimit: 3000000
	});
};

// quita la extension "did:ethr:"
const cleanDid = function(did) {
	let cleanDid = did.split(":");
	cleanDid = cleanDid[cleanDid.length - 1];
	return cleanDid;
};

// realiza una transaccion generica a un contrato ethereum
const makeSignedTransaction = async function(bytecode, credentials) {
	const getNonce = async function(web3, senderAddress) {
		var result = await web3.eth.getTransactionCount(senderAddress, "pending");
		return result;
	};

	const getGasPrice = async function(web3) {
		var block = await web3.eth.getBlock("latest");
		if (block.minimumGasPrice <= 21000) {
			return 21000;
		} else {
			return parseInt(block.minimumGasPrice);
		}
	};

	const rawTx = {
		nonce: await getNonce(web3, credentials.from),
		gasPrice: await getGasPrice(web3),
		gas: await web3.eth.estimateGas({
			to: Constants.BLOCKCHAIN.BLOCK_CHAIN_CONTRACT,
			from: credentials.from,
			data: bytecode
		}),
		data: bytecode,
		to: Constants.BLOCKCHAIN.BLOCK_CHAIN_CONTRACT
	};

	if (Constants.DEBUGG) console.log(rawTx);

	var tx = new Tx(rawTx);
	tx.sign(Buffer.from(credentials.key, "hex"));
	var serializedTx = tx.serialize();
	const res = await web3.eth.sendSignedTransaction("0x" + serializedTx.toString("hex"));
	return res;
};

// realiza una delegacion de "userDID" a "otherDID"
module.exports.addDelegate = async function(userDID, credentials, otherDID) {
	try {
		const contract = getContract(credentials);
		const bytecode = await contract.methods
			.addDelegate(cleanDid(userDID), regName, cleanDid(otherDID), Constants.BLOCKCHAIN.DELEGATE_DURATION)
			.encodeABI();
		const result = await makeSignedTransaction(bytecode, credentials);
		return Promise.resolve(result);
	} catch (err) {
		console.log(err);
		return Promise.reject(Messages.DELEGATE.ERR.DELEGATE);
	}
};

// anula la delegacion de "userDID" a "otherDID" de existir esta
module.exports.revokeDelegate = async function(userDID, credentials, otherDID) {
	try {
		const contract = getContract(credentials);
		const bytecode = await contract.methods.revokeDelegate(cleanDid(userDID), regName, cleanDid(otherDID)).encodeABI();
		const result = await makeSignedTransaction(bytecode, credentials);
		return Promise.resolve(result);
	} catch (err) {
		console.log(err);
		return Promise.reject(Messages.DELEGATE.ERR.DELETE);
	}
};

// retorna true si "userDID" realizo una delegacion de DID a "otherDID"
module.exports.validDelegate = async function(userDID, credentials, otherDID) {
	try {
		const contract = getContract(credentials);
		const result = await contract.methods
			.validDelegate(cleanDid(userDID), regName, cleanDid(otherDID))
			.call(credentials);
		return result;
	} catch (err) {
		console.log(err);
		throw Messages.DELEGATE.ERR.GET_DELEGATE;
	}
};
