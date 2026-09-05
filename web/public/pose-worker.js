// Frames and landmark results stay on this device.
self.exports = {};
importScripts('/vision/vision_bundle.cjs');
let detector = null;
let files = null;
let handDetector = null;
let handLoad = null;
let handsEnabled = false;
async function setHands(enabled) {
  handsEnabled = enabled;
  if (!enabled) {
    self.postMessage({ type: 'hands', status: 'off' });
    return;
  }
  self.postMessage({
    type: 'hands',
    status: handDetector ? 'ready' : 'loading',
  });
  try {
    if (!handDetector) {
      handLoad ??= self.exports.HandLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: '/vision/hand_landmarker.task',
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.65,
        minHandPresenceConfidence: 0.65,
        minTrackingConfidence: 0.65,
      });
      handDetector = await handLoad;
    }
    if (handsEnabled) self.postMessage({ type: 'hands', status: 'ready' });
  } catch {
    handLoad = null;
    handsEnabled = false;
    self.postMessage({ type: 'hands', status: 'error' });
  }
}
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      files = await self.exports.FilesetResolver.forVisionTasks('/vision');
      detector = await self.exports.PoseLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: '/vision/pose_landmarker_lite.task',
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.6,
        minPosePresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
        outputSegmentationMasks: false,
      });
      self.postMessage({ type: 'ready' });
      if (data.hands) await setHands(true);
    } else if (data.type === 'hands' && files && detector) {
      await setHands(data.enabled);
    } else if (data.type === 'frame' && detector) {
      try {
        const result = detector.detectForVideo(data.frame, data.time);
        let hands = [];
        if (handsEnabled && handDetector) {
          try {
            const result = handDetector.detectForVideo(data.frame, data.time);
            hands = result.landmarks.map((points, i) => ({
              points,
              world: result.worldLandmarks[i],
            }));
          } catch {
            handsEnabled = false;
            self.postMessage({ type: 'hands', status: 'error' });
          }
        }
        self.postMessage({
          type: 'pose',
          points: result.landmarks[0] || [],
          hands,
          width: data.frame.width,
          height: data.frame.height,
          time: data.time,
        });
      } finally {
        data.frame.close();
      }
    } else if (data.type === 'close') {
      detector?.close();
      handDetector?.close();
      self.close();
    }
  } catch (error) {
    data.frame?.close?.();
    self.postMessage({
      type: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Pose tracking could not start.',
    });
  }
};
