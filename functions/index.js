const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
admin.initializeApp();

exports.createStaffAccount = onCall(async (request) => {
  // 1. Security Check: Is the caller an Admin OR a VIP Zone Manager?
  const callerUid = request.auth.uid;
  const callerDoc = await admin.firestore().collection("users").doc(callerUid).get();
  
  if (!callerDoc.exists) {
    throw new HttpsError("permission-denied", "User not found.");
  }

  const callerData = callerDoc.data();
  const isAdmin = callerData.role === "admin";
  const isVipManager = callerData.role === "substock" && callerData.isVipZone === true;

  if (!isAdmin && !isVipManager) {
    throw new HttpsError("permission-denied", "You do not have permission to create accounts.");
  }

  const { email, password, role, isVipZone } = request.data;

  try {
    // 2. Create the Auth User
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
    });

    // 3. Create the Firestore Profile
    await admin.firestore().collection("users").doc(userRecord.uid).set({
      email: email,
      role: role,
      isVipZone: isVipZone || false, // <--- ADD THIS LINE (Defaults to false)
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, uid: userRecord.uid };
  } catch (error) {
    throw new HttpsError("internal", error.message);
  }
});