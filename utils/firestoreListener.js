import { auth } from "../firebaseConfig";

export function onFirestoreListenerError(context) {
  return (error) => {
    if (error?.code === "permission-denied" && !auth.currentUser) {
      return;
    }
    console.error(context, error);
  };
}
