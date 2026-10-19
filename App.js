
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { WebView } from 'react-native-webview';
import {
  NavigationContainer,
  useNavigation,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://panznaqniusyrglyozhn.supabase.co';
const SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhbnpuYXFuaXVzeXJnbHlvemhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2NzI0MjQsImV4cCI6MjEwNzI0ODQyNH0.sJFoujIyBpIjqwufbnPFyBTi8Mui8lXeUNZpQ50zzj4';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const systemwideColor = '#0C0D0E';
const containerColor = '#16191C';
const accentColor = '#66D9C5';
const textColor = '#F2F4F5';
const secondaryTextColor = '#92999F';
const borderColor = '#22272B';

const Stack = createNativeStackNavigator();
const STORAGE_BUCKET = 'report-images';

// Interactive map. Tap the map to select a location.
const MAP_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet"
    href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <style>
    html, body, #map {
      height: 100%;
      width: 100%;
      margin: 0;
      padding: 0;
      background: #0C0D0E;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const map = L.map('map').setView([27.9506, -82.4572], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    let marker = null;

    map.on('click', function(event) {
      const latitude = event.latlng.lat;
      const longitude = event.latlng.lng;

      if (marker) {
        marker.setLatLng(event.latlng);
      } else {
        marker = L.marker(event.latlng).addTo(map);
      }

      const message = JSON.stringify({
        type: 'H2O_LOCATION',
        latitude: latitude,
        longitude: longitude
      });

      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(message);
      } else {
        window.parent.postMessage(message, '*');
      }
    });
  </script>
</body>
</html>
`;

// Convert EXIF GPS coordinates into decimal degrees.
function coordinateToDecimal(value) {
  if (typeof value === 'number') return value;

  if (Array.isArray(value)) {
    const parts = value.map((part) => {
      if (typeof part === 'number') return part;

      if (typeof part === 'string') {
        if (part.includes('/')) {
          const [numerator, denominator] = part.split('/').map(Number);
          return denominator ? numerator / denominator : 0;
        }
        return Number(part);
      }

      if (part && typeof part === 'object') {
        const numerator = Number(part.numerator ?? part.num);
        const denominator = Number(part.denominator ?? part.den);
        return denominator ? numerator / denominator : numerator;
      }

      return 0;
    });

    if (parts.length >= 3) {
      return parts[0] + parts[1] / 60 + parts[2] / 3600;
    }

    if (parts.length === 1) return parts[0];
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function extractGps(exif) {
  if (!exif) return null;

  const gps = exif.GPSInfo || exif;

  const latitudeValue =
    gps.GPSLatitude ?? gps.gpsLatitude ?? gps.latitude;

  const longitudeValue =
    gps.GPSLongitude ?? gps.gpsLongitude ?? gps.longitude;

  const latitudeRef =
    gps.GPSLatitudeRef ?? gps.gpsLatitudeRef ?? gps.latitudeRef;

  const longitudeRef =
    gps.GPSLongitudeRef ?? gps.gpsLongitudeRef ?? gps.longitudeRef;

  let latitude = coordinateToDecimal(latitudeValue);
  let longitude = coordinateToDecimal(longitudeValue);

  if (
    latitude === null ||
    longitude === null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < 0 ||
    longitude < 0 ||
    latitude > 90 ||
    longitude > 180
  ) {
    return null;
  }

  if (String(latitudeRef || '').toUpperCase().startsWith('S')) {
    latitude = -latitude;
  }

  if (String(longitudeRef || '').toUpperCase().startsWith('W')) {
    longitude = -longitude;
  }

  return { latitude, longitude };
}

// Cross-platform map picker.
// Web uses an iframe; Android and iOS use WebView.
function MapPicker({ onSelect }) {
  const iframeRef = useRef(null);

  function receiveLocation(raw) {
    try {
      const message = typeof raw === 'string' ? JSON.parse(raw) : raw;

      if (message?.type !== 'H2O_LOCATION') return;

      const latitude = Number(message.latitude);
      const longitude = Number(message.longitude);

      if (
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        Math.abs(latitude) <= 90 &&
        Math.abs(longitude) <= 180
      ) {
        onSelect({ latitude, longitude });
      }
    } catch (error) {
      console.log('Could not read map selection.');
    }
  }

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    function handleMessage(event) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      receiveLocation(event.data);
    }

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [onSelect]);

  if (Platform.OS === 'web') {
    return React.createElement('iframe', {
      ref: iframeRef,
      title: 'Select report location',
      srcDoc: MAP_HTML,
      style: {
        width: '100%',
        height: '320px',
        border: '1px solid ' + borderColor,
        borderRadius: '8px',
      },
      sandbox: 'allow-scripts allow-same-origin',
    });
  }

  return (
    <View style={styles.mapContainer}>
      <WebView
        source={{ html: MAP_HTML }}
        onMessage={(event) => receiveLocation(event.nativeEvent.data)}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        style={styles.map}
      />
    </View>
  );
}

function HomeScreen() {
  const navigation = useNavigation();

  const steps = [
    { number: '1', title: 'Spot', text: 'Notice trash, pollution, or damage' },
    { number: '2', title: 'Document', text: 'Add a photo and mark the spot' },
    { number: '3', title: 'Share', text: 'Neighbors upvote what matters' },
  ];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.homeScroll}>
        <View style={styles.hero}>
          <Image
            source={{
              uri: 'https://wanderlustcraze.com/wp-content/uploads/2026/04/Cleanest-lakes-in-the-US.webp',
            }}
            style={styles.heroImage}
          />
          <View style={styles.heroOverlay} />
          <View style={styles.heroContent}>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>LAKE ACTIVITY REPORTING</Text>
            </View>
            <Text style={styles.heroTitle}>H2O HERO</Text>
            <Text style={styles.heroSubtitle}>
              Protect the waterways in your community.
            </Text>
          </View>
        </View>

        <View style={styles.homeBody}>
          <Text style={styles.homeIntro}>
            Report problems in local rivers, lakes, and streams so your
            community can see what needs attention.
          </Text>

          <View style={styles.stepsRow}>
            {steps.map((step) => (
              <View key={step.number} style={styles.stepTile}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{step.number}</Text>
                </View>
                <Text style={styles.stepTileTitle}>{step.title}</Text>
                <Text style={styles.stepTileText}>{step.text}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={styles.initialButton}
            onPress={() => navigation.navigate('Report')}
          >
            <Text style={styles.initialButtonText}>Report Activity</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('SeeReports')}
          >
            <Text style={styles.secondaryButtonText}>See Reports</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function ReportScreen({ addReport }) {
  const navigation = useNavigation();

  const [reportText, setReportText] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [gps, setGps] = useState(null);
  const [gpsSource, setGpsSource] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function pickImage() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
        base64: true,
        exif: true,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];

      if (!asset.base64) {
        Alert.alert(
          'Photo Error',
          'The photo could not be read. Please try another image.'
        );
        return;
      }

      const mimeType = asset.mimeType || 'image/jpeg';
      const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/webp',
      ];

      if (!allowedTypes.includes(mimeType)) {
        Alert.alert(
          'Unsupported Image',
          'Please choose a JPG, PNG, or WebP image.'
        );
        return;
      }

      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
        Alert.alert(
          'Image Too Large',
          'Choose an image smaller than 5 MB.'
        );
        return;
      }

      setSelectedImage(asset);

      const coordinates = extractGps(asset.exif);

      if (coordinates) {
        setGps(coordinates);
        setGpsSource('photo');

        Alert.alert(
          'GPS Location Found',
          `Latitude: ${coordinates.latitude.toFixed(6)}\n` +
            `Longitude: ${coordinates.longitude.toFixed(6)}\n\n` +
            'You can keep this location or select another point on the map.'
        );
      } else {
        // Keep an already selected manual location if one exists.
        if (gpsSource === 'photo') {
          setGps(null);
          setGpsSource(null);
        }

        Alert.alert(
          'No GPS Metadata',
          'This photo has no usable GPS coordinates. You can select its location on the map.'
        );
      }
    } catch (error) {
      Alert.alert(
        'Photo Error',
        error.message || 'Could not open the photo library.'
      );
    }
  }

  function selectManualLocation(location) {
    setGps(location);
    setGpsSource('manual');
  }

  async function submitReport() {
    const description = reportText.trim();

    if (!description) {
      Alert.alert(
        'Missing Description',
        'Please describe the problem first.'
      );
      return;
    }

    if (description.length > 2000) {
      Alert.alert(
        'Description Too Long',
        'Keep your report under 2001 characters.'
      );
      return;
    }

    setSubmitting(true);

    try {
      await addReport(description, selectedImage, gps);

      setReportText('');
      setSelectedImage(null);
      setGps(null);
      setGpsSource(null);

      Alert.alert(
        'Report Received',
        'Your report was saved to the community database.'
      );

      navigation.goBack();
    } catch (error) {
      Alert.alert(
        'Submission Failed',
        error.message || 'Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  function openGpsMap() {
    if (!gps) return;

    Linking.openURL(
      `https://www.google.com/maps?q=${gps.latitude},${gps.longitude}`
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.contentWrapper}>
          <Text style={styles.subTitle}>Submit a New Tip</Text>

          <Text style={styles.paragraph}>
            Describe what you observed and where the issue occurred.
            You can also upload a photo to help document the problem.
          </Text>

          <Text style={styles.fieldLabel}>Problem Description</Text>

          <TextInput
            style={styles.textInput}
            placeholder="Describe the problem and location..."
            placeholderTextColor={secondaryTextColor}
            multiline
            maxLength={2000}
            value={reportText}
            onChangeText={setReportText}
          />

          <Text style={styles.characterCount}>
            {reportText.length}/2000 characters
          </Text>

          <Text style={styles.fieldLabel}>Photo Evidence</Text>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={pickImage}
            disabled={submitting}
          >
            <Text style={styles.secondaryButtonText}>
              {selectedImage ? 'Choose Another Photo' : 'Upload a Photo'}
            </Text>
          </TouchableOpacity>

          {selectedImage && (
            <View style={styles.photoContainer}>
              <Image
                source={{ uri: selectedImage.uri }}
                style={styles.photoPreview}
                resizeMode="contain"
              />

              <Text style={styles.gpsStatus}>
                {gps && gpsSource === 'photo'
                  ? '✓ GPS coordinates detected in photo'
                  : gps && gpsSource === 'manual'
                  ? '✓ Manual map location selected'
                  : 'GPS coordinates unavailable'}
              </Text>

              <TouchableOpacity
                style={styles.removePhotoButton}
                onPress={() => {
                  setSelectedImage(null);

                  // Keep manually selected coordinates when removing a photo.
                  if (gpsSource === 'photo') {
                    setGps(null);
                    setGpsSource(null);
                  }
                }}
                disabled={submitting}
              >
                <Text style={styles.removePhotoText}>Remove Photo</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* New feature: manual GPS selection */}
          <Text style={styles.fieldLabel}>📍 Select Location on Map</Text>

          <Text style={styles.paragraph}>
            Tap the map where the problem occurred. You can use this
            even when your photo has no GPS metadata.
          </Text>

          <MapPicker onSelect={selectManualLocation} />

          {gps ? (
            <View style={styles.locationContainer}>
              <Text style={styles.gpsStatus}>
                ✓ {gpsSource === 'manual'
                  ? 'Manual location selected'
                  : 'Photo location selected'}
              </Text>

              <Text style={styles.coordinateText}>
                Latitude: {gps.latitude.toFixed(6)}
              </Text>

              <Text style={styles.coordinateText}>
                Longitude: {gps.longitude.toFixed(6)}
              </Text>

              <TouchableOpacity onPress={openGpsMap}>
                <Text style={styles.mapLink}>
                  View selected location on map
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setGps(null);
                  setGpsSource(null);
                }}
                disabled={submitting}
              >
                <Text style={styles.removePhotoText}>Clear Location</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.paragraph}>
              No location selected yet. Tap the map to add coordinates.
            </Text>
          )}

          <Text style={styles.paragraph}>
            Photo GPS is used when available. Selecting a point on the
            map replaces the photo coordinates.
          </Text>

          <TouchableOpacity
            style={[
              styles.initialButton,
              submitting && styles.disabledButton,
            ]}
            onPress={submitReport}
            disabled={submitting}
          >
            <Text style={styles.initialButtonText}>
              {submitting ? 'Submitting...' : 'Submit Report'}
            </Text>
          </TouchableOpacity>

          {submitting && (
            <ActivityIndicator
              color={accentColor}
              style={styles.loader}
            />
          )}

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => navigation.goBack()}
            disabled={submitting}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function SeeReportsScreen({
  reports,
  loading,
  error,
  refreshReports,
  toggleUpvote,
  upvotedIds,
}) {
  const sortedReports = [...reports].sort(
    (a, b) => Number(b.upvotes || 0) - Number(a.upvotes || 0)
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.contentWrapper}>
          <Text style={styles.subTitle}>Community Reports</Text>

          <Text style={styles.paragraph}>
            {reports.length} report
            {reports.length === 1 ? '' : 's'} saved in the community database.
          </Text>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={refreshReports}
            disabled={loading}
          >
            <Text style={styles.secondaryButtonText}>
              {loading ? 'Loading...' : 'Refresh Reports'}
            </Text>
          </TouchableOpacity>

          {loading && reports.length === 0 ? (
            <ActivityIndicator
              size="large"
              color={accentColor}
              style={styles.loader}
            />
          ) : error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : sortedReports.length === 0 ? (
            <Text style={styles.emptyText}>
              No reports yet. Be the first to report a problem!
            </Text>
          ) : (
            sortedReports.map((report, index) => {
              const hasUpvoted = upvotedIds.includes(report.id);

              const hasGps =
                report.latitude !== null &&
                report.latitude !== undefined &&
                report.latitude !== '' &&
                report.longitude !== null &&
                report.longitude !== undefined &&
                report.longitude !== '' &&
                Number.isFinite(Number(report.latitude)) &&
                Number.isFinite(Number(report.longitude));

              return (
                <View key={String(report.id)} style={styles.reportCard}>
                  <Text style={styles.reportNumber}>
                    Report #{index + 1}
                  </Text>

                  <Text style={styles.reportText}>
                    {report.description}
                  </Text>

                  {report.image_url ? (
                    <Image
                      source={{ uri: report.image_url }}
                      style={styles.reportImage}
                      resizeMode="cover"
                    />
                  ) : null}

                  {hasGps && (
                    <View style={styles.locationContainer}>
                      <Text style={styles.gpsStatus}>
                        📍 Report Location
                      </Text>

                      <Text style={styles.coordinateText}>
                        Latitude: {Number(report.latitude).toFixed(6)}
                      </Text>

                      <Text style={styles.coordinateText}>
                        Longitude: {Number(report.longitude).toFixed(6)}
                      </Text>

                      <TouchableOpacity
                        onPress={() =>
                          Linking.openURL(
                            `https://www.google.com/maps?q=${report.latitude},${report.longitude}`
                          )
                        }
                      >
                        <Text style={styles.mapLink}>
                          Open in Google Maps
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  <Text style={styles.reportDate}>
                    {report.created_at
                      ? new Date(report.created_at).toLocaleString()
                      : 'Date unavailable'}
                  </Text>

                  <View style={styles.reportFooter}>
                    <TouchableOpacity
                      style={[
                        styles.upvoteButton,
                        hasUpvoted && styles.upvoteButtonActive,
                      ]}
                      onPress={() => toggleUpvote(report.id)}
                      disabled={hasUpvoted}
                    >
                      <Text
                        style={[
                          styles.upvoteText,
                          hasUpvoted && styles.upvoteTextActive,
                        ]}
                      >
                        {hasUpvoted ? '▲ Upvoted' : '▲ Upvote'}
                      </Text>
                    </TouchableOpacity>

                    <Text style={styles.voteCount}>
                      {Number(report.upvotes || 0)}{' '}
                      {Number(report.upvotes || 0) === 1 ? 'vote' : 'votes'}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

export default function App() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [upvotedIds, setUpvotedIds] = useState([]);

  async function loadReports() {
    setLoading(true);
    setError('');

    try {
      const { data, error: queryError } = await supabase
        .from('reports')
        .select(
          'id, description, upvotes, created_at, latitude, longitude, image_url'
        )
        .order('created_at', { ascending: false });

      if (queryError) throw queryError;

      setReports(data || []);
      return true;
    } catch (err) {
      setError(err.message || 'Could not load reports.');
      return false;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReports();
  }, []);

  async function addReport(description, selectedImage, gps) {
    let imageUrl = null;

    if (selectedImage) {
      if (!selectedImage.base64) {
        throw new Error('The selected photo could not be read.');
      }

      const mimeType = selectedImage.mimeType || 'image/jpeg';

      const extensionByType = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
      };

      const extension = extensionByType[mimeType];

      if (!extension) {
        throw new Error('Please upload a JPG, PNG, or WebP image.');
      }

      if (
        selectedImage.fileSize &&
        selectedImage.fileSize > 5 * 1024 * 1024
      ) {
        throw new Error('The photo must be smaller than 5 MB.');
      }

      const filePath =
        `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, decode(selectedImage.base64), {
          contentType: mimeType,
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(filePath);

      imageUrl = publicUrlData.publicUrl;
    }

    const newReport = {
      description,
      upvotes: 0,
      image_url: imageUrl,
      latitude: gps ? gps.latitude : null,
      longitude: gps ? gps.longitude : null,
    };

    const { error: insertError } = await supabase
      .from('reports')
      .insert([newReport]);

    if (insertError) throw insertError;

    const loaded = await loadReports();

    if (!loaded) {
      throw new Error(
        'The report was submitted, but the latest reports could not be refreshed.'
      );
    }
  }

  async function toggleUpvote(reportId) {
    if (upvotedIds.includes(reportId)) return;

    const { error: voteError } = await supabase.rpc(
      'upvote_report',
      { report_id_input: reportId }
    );

    if (voteError) {
      Alert.alert('Vote Failed', voteError.message);
      return;
    }

    setUpvotedIds((current) => [...current, reportId]);
    await loadReports();
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle: {
            backgroundColor: systemwideColor,
          },
          headerTintColor: textColor,
          headerShadowVisible: false,
          headerTitleStyle: {
            color: textColor,
          },
          contentStyle: {
            backgroundColor: systemwideColor,
          },
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="Report"
          options={{ title: 'Report Issue' }}
        >
          {() => <ReportScreen addReport={addReport} />}
        </Stack.Screen>

        <Stack.Screen
          name="SeeReports"
          options={{ title: 'Community Reports' }}
        >
          {() => (
            <SeeReportsScreen
              reports={reports}
              loading={loading}
              error={error}
              refreshReports={loadReports}
              toggleUpvote={toggleUpvote}
              upvotedIds={upvotedIds}
            />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: systemwideColor,
  },
  scrollContainer: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  contentWrapper: {
    width: '100%',
  },
  subTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: textColor,
    marginBottom: 10,
  },
  paragraph: {
    fontSize: 16,
    color: secondaryTextColor,
    lineHeight: 23,
    marginBottom: 15,
  },
  homeScroll: {
    paddingBottom: 32,
  },
  hero: {
    height: 320,
    justifyContent: 'flex-end',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(12, 13, 14, 0.55)',
  },
  heroContent: {
    padding: 24,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(102, 217, 197, 0.18)',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  heroBadgeText: {
    color: accentColor,
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1.2,
  },
  heroTitle: {
    color: textColor,
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: 1,
  },
  heroSubtitle: {
    color: textColor,
    fontSize: 16,
    opacity: 0.85,
    marginTop: 4,
  },
  homeBody: {
    paddingHorizontal: 16,
    paddingTop: 24,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  homeIntro: {
    color: secondaryTextColor,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 20,
  },
  stepsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 28,
  },
  stepTile: {
    flex: 1,
    backgroundColor: containerColor,
    borderWidth: 1,
    borderColor: borderColor,
    borderRadius: 14,
    padding: 12,
  },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(102, 217, 197, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  stepNumberText: {
    color: accentColor,
    fontSize: 13,
    fontWeight: 'bold',
  },
  stepTileTitle: {
    color: textColor,
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  stepTileText: {
    color: secondaryTextColor,
    fontSize: 12,
    lineHeight: 17,
  },
  initialButton: {
    minHeight: 50,
    backgroundColor: accentColor,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    padding: 12,
  },
  initialButtonText: {
    color: systemwideColor,
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 16,
  },
  disabledButton: {
    opacity: 0.6,
  },
  secondaryButton: {
    minHeight: 48,
    backgroundColor: containerColor,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: borderColor,
    padding: 12,
    marginBottom: 15,
    marginTop: 10,
  },
  secondaryButtonText: {
    color: accentColor,
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 16,
  },
  fieldLabel: {
    color: textColor,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    marginTop: 8,
  },
  textInput: {
    backgroundColor: containerColor,
    borderWidth: 1,
    borderColor: borderColor,
    borderRadius: 8,
    padding: 12,
    color: textColor,
    fontSize: 16,
    textAlignVertical: 'top',
    height: 140,
  },
  characterCount: {
    color: secondaryTextColor,
    fontSize: 12,
    textAlign: 'right',
    marginTop: 6,
    marginBottom: 18,
  },
  photoContainer: {
    backgroundColor: containerColor,
    borderWidth: 1,
    borderColor: borderColor,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  photoPreview: {
    width: '100%',
    height: 220,
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: systemwideColor,
  },
  gpsStatus: {
    color: accentColor,
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 6,
  },
  coordinateText: {
    color: secondaryTextColor,
    fontSize: 13,
    marginTop: 4,
  },
  mapLink: {
    color: accentColor,
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 10,
    textDecorationLine: 'underline',
  },
  removePhotoButton: {
    paddingVertical: 12,
    marginTop: 8,
  },
  removePhotoText: {
    color: '#FF8585',
    textAlign: 'center',
    fontWeight: 'bold',
    marginTop: 10,
  },
  cancelButton: {
    marginTop: 15,
    padding: 10,
  },
  cancelButtonText: {
    color: secondaryTextColor,
    textAlign: 'center',
    fontSize: 16,
  },
  emptyText: {
    color: secondaryTextColor,
    fontSize: 16,
    lineHeight: 24,
    backgroundColor: containerColor,
    padding: 16,
    borderRadius: 8,
    marginTop: 10,
  },
  errorText: {
    color: '#FF8585',
    fontSize: 14,
    lineHeight: 22,
    marginTop: 15,
  },
  loader: {
    marginTop: 20,
  },
  reportCard: {
    backgroundColor: containerColor,
    borderWidth: 1,
    borderColor: borderColor,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    marginTop: 5,
  },
  reportNumber: {
    color: accentColor,
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  reportText: {
    color: textColor,
    fontSize: 16,
    lineHeight: 24,
  },
  reportImage: {
    width: '100%',
    height: 220,
    borderRadius: 8,
    marginTop: 14,
    backgroundColor: systemwideColor,
  },
  locationContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: systemwideColor,
    borderRadius: 8,
  },
  mapContainer: {
    height: 320,
    width: '100%',
    borderWidth: 1,
    borderColor: borderColor,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: containerColor,
    marginBottom: 12,
  },
  map: {
    flex: 1,
    backgroundColor: containerColor,
  },
  reportDate: {
    color: secondaryTextColor,
    fontSize: 12,
    marginTop: 12,
  },
  reportFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: borderColor,
  },
  upvoteButton: {
    backgroundColor: systemwideColor,
    borderWidth: 1,
    borderColor: borderColor,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  upvoteButtonActive: {
    backgroundColor: accentColor,
    borderColor: accentColor,
  },
  upvoteText: {
    color: textColor,
    fontSize: 14,
    fontWeight: 'bold',
  },
  upvoteTextActive: {
    color: systemwideColor,
  },
  voteCount: {
    color: secondaryTextColor,
    fontSize: 14,
  },
});
