import React from 'react';
import { Text, View, ActivityIndicator, StyleSheet, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useUsernames } from '../hooks/useUsernames';

import { auth } from '../firebaseConfig';

export function ContributorsTodaySection({ contributorIds }) {
  const navigation = useNavigation();
  const { usernames, loading } = useUsernames(contributorIds);
  if (!contributorIds || contributorIds.length === 0) return null;
  const currentUserId = auth.currentUser?.uid;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Today's Contributors</Text>
      <View style={styles.card}>
        {(loading && Object.keys(usernames).length === 0) ? (
          <ActivityIndicator size="small" color="#888" />
        ) : (
          <View style={styles.contributorsGrid}>
            {contributorIds.map((uid, idx) => (
              <View style={styles.contributorCell} key={uid}>
                <Pressable
                  style={[styles.contributorBadge, uid === currentUserId && styles.youBadge]}
                  android_ripple={{ color: '#e0e0e0' }}
                  onPress={() => {
                    if (uid === currentUserId) {
                      navigation.navigate('ProfileTab', { screen: 'ProfileHome', params: {} });
                    } else {
                      navigation.navigate('ProfileTab', { screen: 'UserProfile', params: { userId: uid } });
                    }
                  }}
                >
                  <Text style={[styles.contributorBadgeText, uid === currentUserId && styles.youBadgeText]}>{uid === currentUserId ? 'You' : (usernames[uid] || uid)}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 18 },
  sectionTitle: { fontSize: 12, fontWeight: "900", color: '#111111', marginTop: 18, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1, fontFamily: 'CeraRoundProDEMO-Black' },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#cdcdcd',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  contributorsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  contributorCell: {
    width: '50%',
    paddingVertical: 4,
    paddingRight: 8,
  },
  contributorsText: { color: '#555', fontSize: 13, fontWeight: '700', fontFamily: 'CeraRoundProDEMO-Black' },
  contributorBadge: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
    marginBottom: 6,
    marginRight: 6,
    backgroundColor: '#98bfeb',
    shadowColor: '#607c9b',
  },
  contributorBadgeText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#ffffff',
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
  },
  youBadge: {
    backgroundColor: '#8dd479',
    shadowColor: '#6c9d71',
  },
  youBadgeText: {
    color: '#fff',
    fontWeight: '900',
    fontFamily: 'CeraRoundProDEMO-Black',
  },
});