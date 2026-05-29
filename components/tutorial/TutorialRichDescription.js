import React from "react";
import { StyleSheet, Text } from "react-native";
import { theme } from "../../theme";

export default function TutorialRichDescription({
  parts = null,
  description = "",
  emphasis = "",
  suffix = "",
}) {
  if (parts?.length) {
    return (
      <Text style={styles.text}>
        {parts.map((part, index) => (
          <Text
            key={`${part.text}-${index}`}
            style={part.accent ? styles.accent : null}
          >
            {part.text}
          </Text>
        ))}
      </Text>
    );
  }

  if (emphasis) {
    return (
      <Text style={styles.text}>
        {description ? `${description} ` : null}
        <Text style={styles.emphasis}>{emphasis}</Text>
        {suffix ? ` ${suffix}` : null}
      </Text>
    );
  }

  if (!description) return null;

  return <Text style={styles.text}>{description}</Text>;
}

const styles = StyleSheet.create({
  text: {
    fontSize: 15,
    color: "#5a6b7a",
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 16,
  },
  accent: {
    color: theme.accent,
    fontWeight: "800",
  },
  emphasis: {
    color: theme.accent,
    fontWeight: "800",
  },
});
