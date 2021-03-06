const router = require("express").Router();
const ResponseHandler = require("./utils/ResponseHandler");

const Certificate = require("../models/Certificate");
const MouroService = require("../services/MouroService");
const CertService = require("../services/CertService");
const UserService = require("../services/UserService");
const RenaperService = require("../services/RenaperService");
const AuthRequestService = require("../services/AuthRequestService");
const FirebaseService = require("../services/FirebaseService");

const Validator = require("./utils/Validator");
const Messages = require("../constants/Messages");
const Constants = require("../constants/Constants");

/**
 *	Permite validar la identidad de un usuario contra renaper
 */
router.post(
	"/renaper/validateDni",
	Validator.validateBody([
		{ name: "did", validate: [Constants.VALIDATION_TYPES.IS_STRING] },

		{ name: "dni", validate: [Constants.VALIDATION_TYPES.IS_DNI] },
		{ name: "gender", validate: [Constants.VALIDATION_TYPES.IS_GENDER] },

		{ name: "name", validate: [Constants.VALIDATION_TYPES.IS_STRING] },
		{ name: "lastName", validate: [Constants.VALIDATION_TYPES.IS_STRING] },
		{ name: "birthDate", validate: [Constants.VALIDATION_TYPES.IS_STRING] },
		{ name: "order", validate: [Constants.VALIDATION_TYPES.IS_STRING] },

		{ name: "selfieImage", validate: [Constants.VALIDATION_TYPES.IS_BASE_64_IMAGE] },
		{ name: "frontImage", validate: [Constants.VALIDATION_TYPES.IS_BASE_64_IMAGE] },
		{ name: "backImage", validate: [Constants.VALIDATION_TYPES.IS_BASE_64_IMAGE] }
	]),
	Validator.checkValidationResult,
	async function (req, res) {
		const did = req.body.did;

		const dni = req.body.dni;
		const gender = req.body.gender;
		const name = req.body.name;
		const lastName = req.body.lastName;
		const birthDate = req.body.birthDate;
		const order = req.body.order;

		const selfieImage = req.body.selfieImage;
		const frontImage = req.body.frontImage;
		const backImage = req.body.backImage;

		const fingerPrintData = Constants.FINGER_PRINT_DATA;
		const deviceIp = Constants.SERVER_IP;
		const analyzeAnomalies = Constants.RENAPER_ANALYZE_ANOMALIES;
		const analyzeOcr = Constants.RENAPER_ANALYZE_OCR;

		let operationId, authRequest;
		try {
			// obtener usuario
			user = await UserService.getByDID(did);

			// iniciar pedido de validacion de identidad con el renaper
			operationId = await RenaperService.newOpperation(dni, gender, deviceIp, fingerPrintData);

			// guardar estado como "en progreso y retornar"
			authRequest = await AuthRequestService.create(operationId, did);
		} catch (err) {
			return ResponseHandler.sendErr(res, err);
		}

		// retonrar el codigo de operacion para que la APP android pueda consultar el estado de la misma y continuar procesando
		ResponseHandler.sendRes(res, { status: authRequest.status, operationId: authRequest.operationId });

		try {
			// agregar frente del dni al pedido
			console.log(operationId + " adding dni front data for " + did);
			await RenaperService.addFront(dni, gender, operationId, frontImage, analyzeAnomalies, analyzeOcr);

			// agregar dorso del dni al pedido
			console.log(operationId + " adding dni back data for " + did);
			await RenaperService.addBack(dni, gender, operationId, backImage, analyzeAnomalies, analyzeOcr);

			// agregar selfie al pedido
			console.log(operationId + " adding selfie data for " + did);
			await RenaperService.addSelfie(dni, gender, operationId, selfieImage);

			// agregar codigo de barras al pedido
			console.log(operationId + " adding bar code data for " + did);
			await RenaperService.addBarcode(dni, gender, operationId, name, lastName, birthDate, order);

			// ejecutar pedido
			console.log(operationId + " executing request for " + did);
			const userData = await RenaperService.endOperation(dni, gender, operationId);

			console.log(operationId + " checking results for " + did);
			// si no hubo match o no se obtuvo la precision buscada pasar a estado "fallido"
			if (!userData || !userData.confidence || userData.confidence < Constants.RENAPER_SCORE_TRESHOULD) {
				// actualizar estado del pedido para que la APP android sepa que la sincronizacion no fue exitosa
				await authRequest.update(Constants.AUTHENTICATION_REQUEST.FALIED, Messages.RENAPER.WEAK_MATCH.message);
				return;
			}

			// generar certificados con esa info
			const data = JSON.parse(userData.personData.person);

			// cert#1 info personal
			const personData = {
				dni: data.number,
				//"gender": data.gender === "M" ? "Hombre" : "Mujer",
				names: data.names,
				lastNames: data.lastNames,
				//"birthdate": data.birthdate,
				//"cuil": data.cuil,
				//"messageOfDeath": data.messageOfDeath,
				nationality: data.nationality
				//"countryBirth": data.countryBirth
			};

			console.log(operationId + " creating certificates for " + did);
			const generateCert = CertService.createCertificate(
				did,
				{
					"Datos Personales": {
						preview: { fields: ["dni", "names", "lastNames", "nationality"], type: 2 },
						category: "identity",
						data: personData
					}
				},
				data.ExpiryDate,
				Messages.CERTIFICATE.ERR.CREATE
			);

			// cert#2 direccion
			const addressData = {
				streetAddress: data.streetAddress,
				numberStreet: data.numberStreet,
				floor: data.floor,
				department: data.department,
				zipCode: data.zipCode,
				city: data.city,
				municipality: data.municipality,
				province: data.province,
				country: data.country
			};

			const generateAditionalCert = CertService.createCertificate(
				did,
				{
					"Domicilio Legal": {
						preview: { fields: ["streetAddress", "numberStreet", "zipCode", "city", "province", "country"], type: 1 },
						category: "identity",
						data: addressData
					}
				},
				data.ExpiryDate,
				Messages.CERTIFICATE.ERR.CREATE
			);

			// crear certificados en //
			const [cert, aditionalCert] = await Promise.all([generateCert, generateAditionalCert]);

			// enviar en // certificados a mouro para ser guardados
			const saveCert = MouroService.saveCertificate(cert, did);
			const saveAditionalCert = MouroService.saveCertificate(aditionalCert, did);
			const [resCert, resAditionalCert] = await Promise.all([saveCert, saveAditionalCert]);

			try {
				// enviar push notification
				await FirebaseService.sendPushNotification(
					Messages.PUSH.NEW_CERT.TITLE,
					Messages.PUSH.NEW_CERT.MESSAGE,
					user.firebaseId,
					Messages.PUSH.TYPES.NEW_CERT
				);
			} catch (err) {
				console.log("Error sending push notifications:");
			}

			// agregar info de renaper al usuario
			const addCert = Certificate.generate(
				Constants.CERTIFICATE_NAMES.USER_INFO,
				did,
				Constants.CERTIFICATE_STATUS.UNVERIFIED,
				resCert.data,
				resCert.hash
			);
			const addAditionalCert = Certificate.generate(
				Constants.CERTIFICATE_NAMES.USER_ADDRESS,
				did,
				Constants.CERTIFICATE_STATUS.UNVERIFIED,
				resAditionalCert.data,
				resAditionalCert.hash
			);
			await Promise.all([addCert, addAditionalCert]);

			// actualizar estado del pedido para que la APP android sepa que la sincronizacion fue exitosa
			await authRequest.update(Constants.AUTHENTICATION_REQUEST.SUCCESSFUL);

			return;
		} catch (err) {
			await authRequest.update(Constants.AUTHENTICATION_REQUEST.FALIED, err.message);
			return;
		}
	}
);

/**
 *	Retorna el estado del pedido realizado en "/validateDni"
 */
router.post(
	"/renaper/validateDniState",
	Validator.validateBody([
		{ name: "did", validate: [Constants.VALIDATION_TYPES.IS_STRING] },
		{ name: "operationId", validate: [Constants.VALIDATION_TYPES.IS_STRING] }
	]),
	Validator.checkValidationResult,
	async function (req, res) {
		const operationId = req.body.operationId;
		try {
			const authRequest = await AuthRequestService.getByOperationId(operationId);
			return ResponseHandler.sendRes(res, {
				status: authRequest.status,
				operationId: authRequest.operationId,
				message: authRequest.errorMessage
			});
		} catch (err) {
			return ResponseHandler.sendErr(res, err);
		}
	}
);

module.exports = router;
