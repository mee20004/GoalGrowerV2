import React, { useState, useCallback, useRef, useEffect, memo } from "react";
import { 
  View, Text, StyleSheet, ActivityIndicator, ScrollView, 
  Animated, TouchableOpacity, Pressable, Platform, UIManager, LayoutAnimation, PanResponder, Image, ImageBackground 
} from "react-native";
import { collection, doc, onSnapshot, setDoc, writeBatch } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { theme } from "../theme";
import { Ionicons } from "@expo/vector-icons";
import { PLANT_ASSETS } from "../constants/PlantAssets";
const FAR_BG = require('../assets/far_background.png');
const GARDEN_BG = require('../assets/garden_BG.png');

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const POT_IMAGE = require('../assets/plants/pot.png');

// --- 1. PLANT VISUAL COMPONENT ---
const PlantVisual = ({ plant, isDraggingHighlight }) => {
  const total = Number(plant.totalCompletions) || 0;
  
  let stage = 'stage1';
  if (total > 30) stage = 'stage4';
  else if (total > 15) stage = 'stage3';
  else if (total > 5) stage = 'stage2';

  const status = (plant.healthLevel === 1) ? 'dead' : 'alive';
  const species = plant.plantSpecies || (plant.type !== "completion" && plant.type !== "quantity" ? plant.type : "fern");
  const asset = PLANT_ASSETS[species]?.[stage]?.[status] || PLANT_ASSETS['fern']['stage1']['alive'];

  const getPotIcon = () => {
    if (plant.icon) return plant.icon;
    if (plant.goalIcon) return plant.goalIcon;
    return plant.type === 'coding' ? 'code-slash' : 'leaf';
  };

  return (
    <View style={styles.plantAssembly}>
      <ImageBackground source={POT_IMAGE} style={styles.potBackground} imageStyle={styles.potImageTexture} resizeMode="contain">
        <Image source={asset} style={[styles.plantImage, isDraggingHighlight && styles.draggingShadow]} resizeMode="contain" />
        <View style={styles.potLabel}>
          <Ionicons name={getPotIcon()} size={18} color="#fff" />
        </View>
      </ImageBackground>
    </View>
  );
};

// --- 2. DRAGGABLE WRAPPER ---
const DraggablePlant = memo(({ plant, isEditing, wiggleAnim, onLongPress, onDragStart, onDragEnd, onDelete, globalPan, globalDragRef }) => {
  const [isHidden, setIsHidden] = useState(false);
  const latestProps = useRef({ plant, onDragStart, onDragEnd, onDelete, isEditing });
  latestProps.current = { plant, onDragStart, onDragEnd, onDelete, isEditing };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => latestProps.current.isEditing && !globalDragRef.current,
      onMoveShouldSetPanResponder: (_, gesture) => latestProps.current.isEditing && (Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3),
      onPanResponderGrant: (evt, gesture) => {
        setIsHidden(true); 
        const { pageX, pageY, locationX, locationY } = evt.nativeEvent;
        latestProps.current.onDragStart(latestProps.current.plant, pageX, pageY, locationX, locationY);
      },
      onPanResponderMove: Animated.event([null, { dx: globalPan.x, dy: globalPan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gesture) => {
        latestProps.current.onDragEnd(latestProps.current.plant, gesture.moveX, gesture.moveY, () => {
          setIsHidden(false);
        });
      },
      onPanResponderTerminate: () => setIsHidden(false)
    })
  ).current;

  return (
    <Pressable disabled={isEditing} onLongPress={onLongPress} delayLongPress={400}>
      <Animated.View 
        {...panResponder.panHandlers}
        style={[
          styles.plantContainer,
          isEditing && !isHidden && { transform: [{ rotate: wiggleAnim.interpolate({ inputRange: [-1, 1], outputRange: ['-2deg', '2deg'] }) }] },
          { opacity: isHidden ? 0 : 1 } 
        ]}
      >
        {isEditing && plant.shelfPosition && !isHidden && (
          <TouchableOpacity style={styles.deleteBadge} onPress={onDelete}>
            <Ionicons name="close" size={12} color="#fff" />
          </TouchableOpacity>
        )}
        <PlantVisual plant={plant} isDraggingHighlight={false} />
      </Animated.View>
    </Pressable>
  );
});

// --- 3. MAIN GARDEN SCREEN ---
export default function GardenScreen() {
  const [allPlants, setAllPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [globalDragging, setGlobalDragging] = useState(false);
  
  const globalPan = useRef(new Animated.ValueXY()).current;
  const globalDragRef = useRef(false);
  const [draggedGhost, setDraggedGhost] = useState(null); 
  const wiggleAnim = useRef(new Animated.Value(0)).current;

  const slotRefs = useRef({});
  const drawerRef = useRef(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    const unsubLayout = onSnapshot(collection(db, "users", uid, "gardenLayout"), (layoutSnap) => {
      const layoutMap = {};
      layoutSnap.forEach(doc => { layoutMap[doc.id] = doc.data().shelfPosition; });
      const unsubGoals = onSnapshot(collection(db, "users", uid, "goals"), (goalsSnap) => {
        const merged = goalsSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          shelfPosition: layoutMap[doc.id] || null 
        }));
        setAllPlants(merged);
        setLoading(false);
      });
      return () => unsubGoals();
    });
    return () => unsubLayout();
  }, []);

  useEffect(() => {
    if (isEditing) {
      Animated.loop(Animated.sequence([
        Animated.timing(wiggleAnim, { toValue: 1, duration: 130, useNativeDriver: true }),
        Animated.timing(wiggleAnim, { toValue: -1, duration: 130, useNativeDriver: true })
      ])).start();
    } else wiggleAnim.setValue(0);
  }, [isEditing]);

  const handleDragStart = (plant, touchX, touchY) => {
    globalDragRef.current = true;
    setGlobalDragging(true);
    globalPan.setValue({ x: 0, y: 0 });
    setDraggedGhost({ plant, x: touchX - 30, y: touchY - 25 }); 
  };

  const handleDragEnd = async (plant, moveX, moveY, completeLocalDrag) => {
    const unlock = () => {
      globalDragRef.current = false; 
      setGlobalDragging(false);
      setDraggedGhost(null); 
      completeLocalDrag();
    };

    const dest = await checkDropZones(moveX, moveY);
    if (dest) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setAllPlants(prev => {
        const newArr = [...prev];
        const pIdx = newArr.findIndex(p => p.id === plant.id);
        if (dest === 'drawer') {
          newArr[pIdx] = { ...newArr[pIdx], shelfPosition: null };
        } else {
          const [shelf, idx] = dest.split('_');
          const slotIdx = parseInt(idx);
          const occIdx = newArr.findIndex(p => p.shelfPosition?.shelfName === shelf && p.shelfPosition?.slotIndex === slotIdx);
          if (occIdx !== -1 && newArr[occIdx].id !== plant.id) {
            newArr[occIdx] = { ...newArr[occIdx], shelfPosition: plant.shelfPosition };
          }
          newArr[pIdx] = { ...newArr[pIdx], shelfPosition: { shelfName: shelf, slotIndex: slotIdx }};
        }
        return newArr;
      });
      unlock();

      try {
        const uid = auth.currentUser.uid;
        if (dest === 'drawer') {
          await setDoc(doc(db, "users", uid, "gardenLayout", plant.id), { shelfPosition: null }, { merge: true });
        } else {
          const [shelf, idx] = dest.split('_');
          const batch = writeBatch(db);
          const occupant = allPlants.find(p => p.shelfPosition?.shelfName === shelf && p.shelfPosition?.slotIndex === parseInt(idx));
          if (occupant && occupant.id !== plant.id) {
            batch.set(doc(db, "users", uid, "gardenLayout", occupant.id), { shelfPosition: plant.shelfPosition }, { merge: true });
          }
          batch.set(doc(db, "users", uid, "gardenLayout", plant.id), { shelfPosition: { shelfName: shelf, slotIndex: parseInt(idx) } }, { merge: true });
          await batch.commit();
        }
      } catch (e) { console.error(e); }
    } else {
      Animated.spring(globalPan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start(unlock);
    }
  };

  const checkDropZones = async (moveX, moveY) => {
    if (drawerRef.current) {
      const dRect = await new Promise(res => drawerRef.current.measure((x, y, w, h, px, py) => {
        res(px !== undefined ? { l: px, r: px + w, t: py, b: py + h } : null);
      }));
      if (dRect && moveX >= dRect.l && moveX <= dRect.r && moveY >= dRect.t && moveY <= dRect.b) return 'drawer';
    }
    for (const key of Object.keys(slotRefs.current)) {
      const rect = await new Promise(res => slotRefs.current[key].measure((x, y, w, h, px, py) => {
        res(px !== undefined ? { l: px - 15, r: px + w + 15, t: py - 15, b: py + h + 15 } : null);
      }));
      if (rect && moveX >= rect.l && moveX <= rect.r && moveY >= rect.t && moveY <= rect.b) return key;
    }
    return null;
  };

  // --- EXACT SHELF CONFIGS FROM ORIGINAL ---
  const SHELF_CONFIG = {
    topShelf: { side: 'left', width: '60%', offsetTop: -20, slots: 3 },
    middleShelf: { side: 'right', width: '60%', offsetTop: -20, slots: 3 },
    bottomShelf: { side: 'full', width: '100%', offsetTop: 132, slots: 4 },
  };

  const renderShelf = (shelfName) => {
    const config = SHELF_CONFIG[shelfName];
    return (
      <View key={shelfName} style={[styles.shelfWrapper, { width: config.width, alignSelf: config.side==='left'?'flex-start':config.side==='right'?'flex-end':'center', marginTop: config.offsetTop }]}>
        <View style={styles.shelfLedge} /><View style={styles.shelfFront} />
        <View style={styles.slotsRow}>
          {Array.from({ length: config.slots }).map((_, idx) => {
            const occupant = allPlants.find(p => p.shelfPosition?.shelfName === shelfName && p.shelfPosition?.slotIndex === idx);
            const slotKey = `${shelfName}_${idx}`;
            return (
              <View key={slotKey} ref={el => slotRefs.current[slotKey] = el} style={[styles.slot, isEditing && styles.slotEditBox]} collapsable={false}>
                {occupant && (
                  <DraggablePlant 
                    key={occupant.id}
                    plant={occupant} isEditing={isEditing} wiggleAnim={wiggleAnim} 
                    onLongPress={() => setIsEditing(true)} globalPan={globalPan} globalDragRef={globalDragRef} 
                    onDragStart={handleDragStart} onDragEnd={handleDragEnd} 
                    onDelete={() => setDoc(doc(db, "users", auth.currentUser.uid, "gardenLayout", occupant.id), { shelfPosition: null }, { merge: true })}
                  />
                )}
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  if (loading) return <View style={styles.loader}><ActivityIndicator size="large" color="#2D5A27" /></View>;

return (
  <View style={styles.container}>
    <View style={styles.header}>
      <Text style={styles.headerTitle}>My Garden</Text>
      <TouchableOpacity 
        style={isEditing ? styles.doneBtn : styles.editBtn} 
        onPress={() => setIsEditing(!isEditing)}
      >
        <Text style={styles.btnText}>{isEditing ? "Done" : "Edit"}</Text>
      </TouchableOpacity>
    </View>

      {/* --- OUTER (FAR) BACKGROUND --- */}
      <ImageBackground 
        source={FAR_BG} 
        style={styles.farBackground} 
        imageStyle={styles.farImageStyle} // <--- Manual adjustment here
        resizeMode="contain"
      >
        
        {/* --- INNER (GARDEN) BACKGROUND --- */}
        <ImageBackground 
          source={GARDEN_BG} 
          style={styles.gardenBackground} 
          imageStyle={styles.gardenImageStyle} // <--- Manual adjustment here
          resizeMode="cover"
        >
          <View style={styles.gardenMain}>
            {["topShelf", "middleShelf", "bottomShelf"].map(renderShelf)}
          </View>
        </ImageBackground>
        
      </ImageBackground>

      <View style={styles.drawer} ref={drawerRef} collapsable={false}>
        <View style={styles.drawerLip} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.drawerList} scrollEnabled={!globalDragging}>
          {allPlants.filter(p => !p.shelfPosition).map(plant => (
            <View key={plant.id} style={{ marginHorizontal: 10 }}>
              <DraggablePlant 
                plant={plant} isEditing={isEditing} wiggleAnim={wiggleAnim} 
                onLongPress={() => setIsEditing(true)} globalPan={globalPan} globalDragRef={globalDragRef} 
                onDragStart={handleDragStart} onDragEnd={handleDragEnd}
              />
            </View>
          ))}
        </ScrollView>
      </View>

      {draggedGhost && (
        <Animated.View style={[styles.ghost, { left: draggedGhost.x, top: draggedGhost.y, transform: globalPan.getTranslateTransform() }]}>
          <PlantVisual plant={draggedGhost.plant} isDraggingHighlight={true} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fdfbf700' },
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20, backgroundColor: "#fff", flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 },
  headerTitle: { fontSize: 22, fontWeight: "900", color: "#2D5A27" },
  editBtn: { backgroundColor: '#eee', paddingHorizontal: 15, paddingVertical: 6, borderRadius: 20 },
  doneBtn: { backgroundColor: '#2D5A27', paddingHorizontal: 15, paddingVertical: 6, borderRadius: 20 },
  btnText: { fontWeight: 'bold', color: '#444' },

  gardenMain: { flex: 1, paddingBottom: 160, paddingTop: 40, justifyContent: 'space-around' },
  shelfWrapper: { height: 130, justifyContent: 'flex-end', marginBottom: 20 },
  shelfLedge: { position: 'absolute', bottom: 6, width: '102%', height: 50, backgroundColor: '#945b35', borderRadius: 2 },
  shelfFront: { position: 'absolute', bottom: 0, height: 16, width: '102%', backgroundColor: '#713d17', borderRadius: 2 },
  slotsRow: { height: 80, flexDirection: "row", justifyContent: "space-around", width: '100%', zIndex: 5 },
  slot: { width: 80, height: 80, justifyContent: 'flex-end', alignItems: 'center', borderRadius: 12 },
  slotEditBox: { borderWidth: 2, borderColor: '#d1d1d1', borderStyle: 'dashed', backgroundColor: 'rgba(0,0,0,0.02)' },

  drawer: { position: 'absolute', bottom: 0, height: 140, width: '100%', backgroundColor: '#3d2b1f', borderTopWidth: 4, borderColor: '#2a1d15', zIndex: 100 },
  drawerList: { paddingHorizontal: 20, alignItems: 'center', minWidth: '100%', flexGrow: 1, justifyContent: 'center', bottom: -10 },

  plantContainer: { width: 100, height: 125, alignItems: 'center', justifyContent: 'flex-end', bottom: -15 },
  plantAssembly: { alignItems: 'center', justifyContent: 'flex-end', width: '100%', height: '100%' },
  potBackground: { width: 70, height: 90, alignItems: 'center', justifyContent: 'flex-end', position: 'relative' },
  potImageTexture: { width: '100%', height: '60%', bottom: 0, position: 'absolute' },
  plantImage: { width: 65, height: 85, position: 'absolute', bottom: 74, zIndex: 1 },
  
  potLabel: { position: 'absolute', bottom: 40, minWidth: 24, minHeight: 24, justifyContent: 'center', alignItems: 'center', zIndex: 2 },

  gardenBackground: { flex: 1, width: '100%', height: '100%', bottom: 0 },
  backgroundImageTexture: { top: -80 },
  
  draggingShadow: { opacity: 0.7, transform: [{ scale: 1.1 }] },
  deleteBadge: { position: 'absolute', top: -10, left: -10, backgroundColor: '#E74C3C', width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', zIndex: 10, borderWidth: 2, borderColor: '#fff' },
  ghost: { position: 'absolute', pointerEvents: 'none', zIndex: 9999 },





  // The container stays fullscreen
  farBackground: {
    flex: 1,
    width: '100%',
    backgroundColor: '#1a1a1a', // Fallback color
  },

  // MANUALLY ADJUST THE FAR IMAGE HERE
  farImageStyle: {
    top: 0,            // Move up/down (e.g., -50 to pull it up)
    left: 15,           // Move left/right
    opacity: 1,      // Good for making it feel "distant"
    height: '120%', 
    transform: [
    { scale: 1.3 }   // Zooms in/out on the garden texture specifically
    ],   // Make it slightly taller than the screen if you need to offset 'top'
  },

  gardenBackground: {
    flex: 1,
    width: '100%',
  },

  // MANUALLY ADJUST THE GARDEN/FLOOR IMAGE HERE
  gardenImageStyle: {
    top: -180,          // Shifts the garden texture relative to the shelves
    transform: [
      { scale: 1.1 }   // Zooms in/out on the garden texture specifically
    ],
  },
});