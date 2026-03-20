// screens/GoalsScreen.js
import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator } from "react-native";
import { getFirestore, collection, onSnapshot } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { Ionicons } from "@expo/vector-icons";
import Page from "../components/Page";
import { theme } from "../theme";

export default function GoalsScreen({ navigation }) {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getAuth();
    const DB = getFirestore();

    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setLoading(true);
        const goalsRef = collection(DB, "users", user.uid, "goals");
        const unsub = onSnapshot(goalsRef, (snapshot) => {
          const goalsData = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          setGoals(goalsData);
          setLoading(false);
        });
        return () => unsub();
      } else {
        setGoals([]);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleAddGoal = () => {
    navigation.navigate("AddGoal");
  };

  const handleCalendar = () => {
    navigation.navigate("Calendar");
  };

  const handleGarden = () => {
    navigation.navigate("Garden");
  };

  const handleGoalPress = (goalId) => {
    navigation.navigate("Goal", { goalId });
  };

  const renderGoal = ({ item }) => (
    <Pressable
      onPress={() => handleGoalPress(item.id)}
      style={styles.goalCard}
    >
      <View style={styles.goalContent}>
        <Text style={styles.goalName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.goalMeta}>
          {item.frequencyLabel || "Custom"} • {item.kind || "goal"}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={24} color={theme.muted} />
    </Pressable>
  );

  if (loading) {
    return (
      <Page>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      </Page>
    );
  }

  return (
    <Page>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Goals</Text>
        <View style={styles.headerButtons}>
          <Pressable onPress={handleAddGoal} style={styles.headerBtn}>
            <Ionicons name="add" size={20} color={theme.text} />
          </Pressable>
          <Pressable onPress={handleCalendar} style={styles.headerBtn}>
            <Ionicons name="calendar" size={20} color={theme.text} />
          </Pressable>
          <Pressable onPress={handleGarden} style={styles.headerBtn}>
            <Ionicons name="flower" size={20} color={theme.text} />
          </Pressable>
        </View>
      </View>

      {goals.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No goals yet</Text>
          <Text style={styles.emptySubtext}>Create your first goal to get started</Text>
          <Pressable onPress={handleAddGoal} style={styles.addBtn}>
            <Text style={styles.addBtnText}>+ Add Goal</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={goals}
          keyExtractor={(item) => item.id}
          renderItem={renderGoal}
          scrollEnabled={false}
          contentContainerStyle={styles.list}
        />
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: theme.text,
  },
  headerButtons: {
    flexDirection: "row",
    gap: 8,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: theme.radius,
    backgroundColor: theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    gap: 8,
  },
  goalCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  goalContent: {
    flex: 1,
  },
  goalName: {
    fontSize: 16,
    fontWeight: "900",
    color: theme.text,
  },
  goalMeta: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.muted,
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "900",
    color: theme.text,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.muted,
    marginBottom: 24,
    textAlign: "center",
  },
  addBtn: {
    backgroundColor: theme.accent,
    borderRadius: theme.radius,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: "900",
    color: theme.bg,
  },
});
