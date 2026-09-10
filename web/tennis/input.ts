import type { MotionFeedback } from './motion';
import type { TennisController, TennisStatus } from './types';

export function applyCameraFeedback(
  target: Pick<TennisController, 'motion' | 'feed'>,
  feedback: MotionFeedback,
  status: Pick<TennisStatus, 'phase' | 'paused'>,
) {
  target.motion(status.paused ? {} : feedback);
  if (
    !status.paused &&
    feedback.toss &&
    (status.phase === 'ready' || status.phase === 'result')
  )
    target.feed();
}
