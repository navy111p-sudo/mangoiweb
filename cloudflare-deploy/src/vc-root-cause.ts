// MANGOI WebRTC root-cause classifier.
// Pure/evidence-first: it does not touch calls, ICE, TURN, or production state.

export type TeacherNetworkType = 'HOME' | 'OFFICE' | 'UNKNOWN';
export type RootCause =
  | 'STUDENT_NETWORK'
  | 'HOME_TEACHER_NETWORK'
  | 'OFFICE_TEACHER_NETWORK'
  | 'COMMON_WEBRTC'
  | 'STUN_TURN'
  | 'UNKNOWN';

export interface QualityWindow {
  role: 'student' | 'teacher' | string;
  teacher_network_type?: TeacherNetworkType;
  avg_loss?: number | null;
  rx_loss?: number | null;
  rx_aloss?: number | null;
  rx_conceal?: number | null;
  rx_freeze?: number | null;
  path?: 'direct' | 'relay' | 'mixed' | '';
  recovery_failed?: boolean;
}

export interface Diagnosis {
  category: RootCause;
  observed_facts: string[];
  hypothesis: string;
  evidence: string[];
  required_verification: string[];
  proposed_fix: string[];
}

const known = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
export function isBadWindow(w: QualityWindow): boolean {
  return (known(w.avg_loss) && w.avg_loss >= 3)
    || (known(w.rx_loss) && w.rx_loss >= 3)
    || (known(w.rx_aloss) && w.rx_aloss >= 3)
    || (known(w.rx_conceal) && w.rx_conceal >= 5)
    || (known(w.rx_freeze) && w.rx_freeze > 0)
    || w.recovery_failed === true;
}

export function classifyRootCause(rows: QualityWindow[]): Diagnosis {
  const bad = rows.filter(isBadWindow);
  const facts = [
    `windows=${rows.length}`,
    `bad_windows=${bad.length}`,
    `home_bad=${bad.filter(x => x.role === 'teacher' && x.teacher_network_type === 'HOME').length}`,
    `office_bad=${bad.filter(x => x.role === 'teacher' && x.teacher_network_type === 'OFFICE').length}`,
    `student_bad=${bad.filter(x => x.role === 'student').length}`,
    `unknown_bad=${bad.filter(x => x.role !== 'student' && x.teacher_network_type !== 'HOME' && x.teacher_network_type !== 'OFFICE').length}`,
    `relay_bad=${bad.filter(x => x.path === 'relay').length}`
  ];
  if (!bad.length) return {
    category: 'UNKNOWN', observed_facts: facts,
    hypothesis: 'No degraded window is present in the supplied evidence.',
    evidence: [], required_verification: ['Collect more session windows if a user reported a problem.'],
    proposed_fix: []
  };

  const home = bad.filter(x => x.role === 'teacher' && x.teacher_network_type === 'HOME').length;
  const office = bad.filter(x => x.role === 'teacher' && x.teacher_network_type === 'OFFICE').length;
  const student = bad.filter(x => x.role === 'student').length;
  const unknown = bad.filter(x => x.role !== 'student' && x.teacher_network_type !== 'HOME' && x.teacher_network_type !== 'OFFICE').length;
  const relay = bad.filter(x => x.path === 'relay').length;
  const directBad = bad.filter(x => x.path === 'direct').length;

  if (relay === bad.length && bad.length >= 2 && directBad === 0) return {
    category: 'STUN_TURN', observed_facts: facts,
    hypothesis: 'The degraded samples are confined to relay/TURN paths.',
    evidence: ['All degraded windows with a known path are relay windows.'],
    required_verification: ['Compare the same endpoints on a direct path.', 'Compare TURN region/protocol and RTT before changing TURN configuration.'],
    proposed_fix: ['Inspect TURN capacity, region selection and routing; do not force a production change without the comparison test.']
  };
  if (home >= 2 && office === 0 && student === 0 && unknown === 0) return {
    category: 'HOME_TEACHER_NETWORK', observed_facts: facts,
    hypothesis: 'Degradation is concentrated in Home Teacher sessions.',
    evidence: ['Multiple degraded HOME teacher windows and no degraded OFFICE/student windows in this sample.'],
    required_verification: ['Compare teacher ISP/Wi-Fi/LAN/device and time-of-day.', 'Reproduce the profile in Sandbox.'],
    proposed_fix: ['Prefer wired LAN where possible; verify home ISP/router before changing MANGOI WebRTC code.']
  };
  if (office >= 2 && home === 0 && student === 0 && unknown === 0) return {
    category: 'OFFICE_TEACHER_NETWORK', observed_facts: facts,
    hypothesis: 'Degradation is concentrated in Office Teacher sessions.',
    evidence: ['Multiple degraded OFFICE teacher windows and no degraded HOME/student windows in this sample.'],
    required_verification: ['Check whether multiple office teachers degrade in the same time window.', 'Compare shared line/router/firewall utilization.'],
    proposed_fix: ['Investigate the shared business line/router/firewall and capacity before changing client recovery.']
  };
  if (student >= 2 && home === 0 && office === 0 && unknown === 0) return {
    category: 'STUDENT_NETWORK', observed_facts: facts,
    hypothesis: 'Degradation is concentrated on student-side samples.',
    evidence: ['Multiple degraded student windows without matching teacher-group degradation in this sample.'],
    required_verification: ['Compare student ISP/device/browser/network type.', 'Check whether the same teacher is healthy with other students.'],
    proposed_fix: ['Use student-side preflight guidance and network remediation if verified.']
  };
  if (home > 0 && office > 0) return {
    category: 'COMMON_WEBRTC', observed_facts: facts,
    hypothesis: 'Both Home and Office teacher groups show degradation, so a common path is plausible.',
    evidence: ['Degraded windows exist in both teacher network groups.'],
    required_verification: ['Correlate signaling/ICE/TURN/server events by timestamp.', 'Check whether affected students/regions overlap.'],
    proposed_fix: ['Reproduce the common failure in Sandbox and make only the smallest verified WebRTC/server change.']
  };
  return {
    category: 'UNKNOWN', observed_facts: facts,
    hypothesis: 'The evidence is mixed or insufficient for a reliable root-cause category.',
    evidence: ['Observed degradation does not isolate one group or path.'],
    required_verification: ['Collect more synchronized endpoint/path/recovery evidence.'],
    proposed_fix: []
  };
}
