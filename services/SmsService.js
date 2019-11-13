const Phone = require("../models/Phone");

const Messages = require("../constants/Messages");
const Constants = require("../constants/Constants");

const twilio = require("twilio");

// realiza el envio de sms con el còdigo de validaciòn usando "Twillio"
module.exports.sendValidationCode = async function(phoneNumber, code) {
	const data = {
		body: Messages.SMS.VALIDATION.MESSAGE(code),
		to: Constants.PHONE_REGION + phoneNumber.substring(phoneNumber.length - 8),
		from: Constants.TWILIO_PHONE_NUMBER
	};

	var client = twilio(Constants.TWILIO_SID, Constants.TWILIO_TOKEN);
	if (Constants.DEBUGG) console.log(Messages.SMS.SENDING(data.to));

	try {
		await client.messages.create(data);
		if (Constants.DEBUGG) console.log(Messages.SMS.SENT);
	} catch (err) {
		console.log(err);
	}
};

// crear y guardar pedido de validacion de tel
module.exports.create = async function(phoneNumber, code, did) {
	try {
		let phone = await Phone.generate(phoneNumber, code, did);
		if (!phone) return Promise.reject(Messages.SMS.ERR.CREATE);
		return Promise.resolve(phone);
	} catch (err) {
		console.log(err);
		return Promise.reject(Messages.SMS.ERR.COMMUNICATION_ERROR);
	}
};

module.exports.validatePhone = async function(phoneNumber, code, did) {
	let phone;
	try {
		phone = await Phone.getByPhoneNumber(phoneNumber);
		if (!phone) return Promise.reject(Messages.SMS.ERR.NO_VALIDATIONS_FOR_NUMBER);
		if (phone.expired()) return Promise.reject(Messages.SMS.ERR.VALIDATION_EXPIRED);
	} catch (err) {
		console.log(err);
		return Promise.reject(Messages.EMAIL.ERR.COMMUNICATION_ERROR);
	}

	try {
		// validar tel
		phone = await phone.validatePhone(code, did);
		if (!phone) return Promise.reject(Messages.SMS.ERR.NO_SMSCODE_MATCH);
		return Promise.resolve(phone);
	} catch (err) {
		console.log(err);
		return Promise.reject(Messages.SMS.ERR.COMMUNICATION_ERROR);
	}
};

// indica si el pedido de tel de mail fue validado
module.exports.isValidated = async function(did, phoneNumber) {
	try {
		let isValidated = await Phone.isValidated(did, phoneNumber);
		return Promise.resolve(isValidated);
	} catch (err) {
		console.log(err);
		return Promise.reject(Messages.SMS.ERR.COMMUNICATION_ERROR);
	}
};
