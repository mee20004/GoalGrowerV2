import React from "react";
import { Text as RNText, TextInput as RNTextInput } from "react-native";


export function applyGlobalFont(fontFamily = "Cera Round Pro DEMO") {
  if (RNText.defaultProps == null) RNText.defaultProps = {};
  if (RNTextInput.defaultProps == null) RNTextInput.defaultProps = {};
  RNText.defaultProps.style = [RNText.defaultProps.style, { fontFamily }];
  RNTextInput.defaultProps.style = [RNTextInput.defaultProps.style, { fontFamily }];
}

export function FontProvider({ children }) {
  React.useEffect(() => {
    applyGlobalFont();
  }, []);
  return children;
}
