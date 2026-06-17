import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { useSubscription } from "../components/SubscriptionProvider";
import { useGoals } from "../components/GoalsStore";
import {
  canAddGardenPage,
  canCreateGoal,
  canCreateSharedGarden,
  canJoinSharedGarden,
  getUsageSummary,
  tryNavigateToAddGoal,
} from "../utils/subscriptionLimits";

export function useSubscriptionLimits() {
  const { isPro, openDefaultPaywall } = useSubscription();
  const { goals } = useGoals();
  const uid = auth.currentUser?.uid ?? null;
  const [sharedGardens, setSharedGardens] = useState([]);

  useEffect(() => {
    if (!uid) {
      setSharedGardens([]);
      return undefined;
    }

    const unsub = onSnapshot(
      query(collection(db, "sharedGardens"), where("memberIds", "array-contains", uid)),
      (snap) => {
        setSharedGardens(snap.docs.map((gardenDoc) => ({ id: gardenDoc.id, ...gardenDoc.data() })));
      },
      (error) => {
        console.error("useSubscriptionLimits shared gardens listener failed", error);
      }
    );

    return unsub;
  }, [uid]);

  const usage = useMemo(
    () => getUsageSummary({ isPro, goals, gardens: sharedGardens, uid }),
    [isPro, goals, sharedGardens, uid]
  );

  const checkCreateGoal = useCallback(
    () => canCreateGoal({ isPro, goals }),
    [isPro, goals]
  );

  const checkCreateSharedGarden = useCallback(
    () => canCreateSharedGarden({ isPro, gardens: sharedGardens, uid }),
    [isPro, sharedGardens, uid]
  );

  const checkJoinSharedGarden = useCallback(
    () => canJoinSharedGarden({ isPro, gardens: sharedGardens, uid }),
    [isPro, sharedGardens, uid]
  );

  const checkAddGardenPage = useCallback(
    (pages = []) => canAddGardenPage({ isPro, pages }),
    [isPro]
  );

  const attemptNavigateToAddGoal = useCallback(
    (navigation, params) => tryNavigateToAddGoal({
      navigation,
      isPro,
      goals,
      openDefaultPaywall,
      params,
    }),
    [isPro, goals, openDefaultPaywall]
  );

  return {
    isPro,
    usage,
    sharedGardens,
    checkCreateGoal,
    checkCreateSharedGarden,
    checkJoinSharedGarden,
    checkAddGardenPage,
    attemptNavigateToAddGoal,
  };
}
