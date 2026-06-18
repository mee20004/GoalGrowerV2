import {
  updateEmail,
  verifyBeforeUpdateEmail,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import {
  sendVerificationEmail,
  buildWebEmailVerificationSettings,
} from "./emailVerification";

export function isValidEmailAddress(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function isVerifyBeforeUpdateRequired(error) {
  const code = error?.code || "";
  const message = String(error?.message || "").toLowerCase();
  return (
    code === "auth/operation-not-allowed" &&
    message.includes("verify the new email")
  );
}

export function formatEmailChangeError(error) {
  const code = error?.code || "";
  switch (code) {
    case "auth/email-already-in-use":
      return "That email already has an account. Try logging in instead.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/requires-recent-login":
      return "For your security, please re-enter your password and try again.";
    case "auth/operation-not-allowed":
      return "Could not update your email right now. Try again or use Start over on the verify screen.";
    default:
      return error?.message || "Could not update your email. Please try again.";
  }
}

async function reauthenticateIfNeeded(user, password) {
  if (!password || !user?.email) return;
  const credential = EmailAuthProvider.credential(user.email, password);
  await reauthenticateWithCredential(user, credential);
}

export async function changeUserEmail(
  user,
  newEmail,
  { sendVerification = true, forceSend = true, password, skipReauth = false } = {}
) {
  const trimmedEmail = String(newEmail || "").trim();
  if (!user?.uid) {
    throw new Error("Not signed in");
  }
  if (!isValidEmailAddress(trimmedEmail)) {
    const error = new Error("Invalid email");
    error.code = "auth/invalid-email";
    throw error;
  }
  if (trimmedEmail === user.email) {
    return { changed: false, reason: "unchanged" };
  }

  if (!skipReauth) {
    await reauthenticateIfNeeded(user, password);
  }

  try {
    await updateEmail(user, trimmedEmail);
    await setDoc(doc(db, "users", user.uid), { email: trimmedEmail }, { merge: true });

    if (!sendVerification) {
      return { changed: true, verificationSent: false, pendingVerification: false };
    }

    try {
      await sendVerificationEmail(user, { force: forceSend });
      return { changed: true, verificationSent: true, pendingVerification: false };
    } catch (verificationError) {
      return { changed: true, verificationSent: false, pendingVerification: false, verificationError };
    }
  } catch (error) {
    if (!isVerifyBeforeUpdateRequired(error)) {
      throw error;
    }

    await verifyBeforeUpdateEmail(
      user,
      trimmedEmail,
      buildWebEmailVerificationSettings()
    );
    await setDoc(
      doc(db, "users", user.uid),
      { email: trimmedEmail, pendingEmailChange: trimmedEmail },
      { merge: true }
    );

    return {
      changed: true,
      verificationSent: true,
      pendingVerification: true,
    };
  }
}
