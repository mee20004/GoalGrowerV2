import React from "react";
import { Text as RNText, TextInput as RNTextInput } from "react-native";
import * as Font from 'expo-font';
import { useFonts } from 'expo-font';

export function applyGlobalFont(fontFamily = "CeraRoundProDEMO-Black") {
  if (RNText.defaultProps == null) RNText.defaultProps = {};
  if (RNTextInput.defaultProps == null) RNTextInput.defaultProps = {};
  RNText.defaultProps.style = [RNText.defaultProps.style, { fontFamily }];
  RNTextInput.defaultProps.style = [RNTextInput.defaultProps.style, { fontFamily }];
}

export function FontProvider({ children }) {
  const [fontsLoaded] = useFonts({
    'CeraRoundProDEMO-Black': require('../assets/fonts/CeraRoundProDEMOBlack.otf'),
  });

  React.useEffect(() => {
    if (fontsLoaded) {
      applyGlobalFont('CeraRoundProDEMO-Black');
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null; // Optionally, render a loading spinner here

  return children;
}
