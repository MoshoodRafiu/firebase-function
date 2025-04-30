const path = require("path");
const axios = require("axios");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const { defineString } = require("firebase-functions/params");
const serviceAccount = require(path.join(__dirname, "serviceAccountKey.json"));
const { onDocumentCreated, onDocumentUpdated, onDocumentDeleted } = require("firebase-functions/v2/firestore");

const app = admin.initializeApp({
	credential: admin.credential.cert(serviceAccount),
	region: "me-central2",
});

const storeObject = (databaseName) => {
	return {
		document: "Messages/{messageId}",
		database: databaseName,
		region: "me-central2",
	};
};

const clients = [
	{
		name: "default",
		databaseName: "(default)",
		baseUrl: "API_BASE_URL",
		apiKey: "API_KEY",
	},
	{
		name: "conferenceChat",
		databaseName: "conference-chat",
		baseUrl: "CONFERENCE_API_BASE_URL",
		apiKey: "CONFERENCE_API_KEY",
	},
];

for (let { name, databaseName, baseUrl, apiKey } of clients) {
	const clientApiKey = defineString(apiKey);
	const clientBaseUrl = defineString(baseUrl);

	exports[`messageCreated_${name}`] = onDocumentCreated(storeObject(databaseName), async (event) => {
		const snap = event.data;
		await sendChatEvent({
			type: "create",
			payload: snap.data(),
			databaseName,
			clientBaseUrl,
			clientApiKey,
		});
	});

	exports[`messageUpdated_${name}`] = onDocumentUpdated(storeObject(databaseName), async (event) => {
		await sendChatEvent({
			type: "update",
			payload: event.data.after.data(),
			databaseName,
			clientBaseUrl,
			clientApiKey,
		});
	});

	exports[`messageDeleted_${name}`] = onDocumentDeleted(storeObject(databaseName), async (event) => {
		const snap = event.data;
		await sendChatEvent({ type: "delete", payload: snap.data(), databaseName, clientBaseUrl, clientApiKey });
	});
}

const sendChatEvent = async ({ type, payload, databaseName, clientBaseUrl, clientApiKey }) => {
	const dbInstance = getFirestore(app, databaseName);
	const unreadMessagesSnapshot = await dbInstance
		.collection("Messages")
		.where("chatID", "==", payload.chatID)
		.where("readAt", "==", null)
		.get();

	try {
		await axios.post(
			`${clientBaseUrl.value()}chat-event`,
			{
				type,
				payload,
				unreadMessages: unreadMessagesSnapshot.size,
			},
			{
				headers: { "x-chat-api-key": clientApiKey.value() },
			},
		);
		console.log("System notified!");
	} catch (error) {
		console.error("System not notified!");
		console.error(error);
	}
};
