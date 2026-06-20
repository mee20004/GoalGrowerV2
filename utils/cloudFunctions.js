import { httpsCallable } from "firebase/functions";
import { functions } from "../firebaseConfig";

export async function callCloudFunction(name, data = {}) {
  const callable = httpsCallable(functions, name);
  const result = await callable(data);
  return result.data;
}
