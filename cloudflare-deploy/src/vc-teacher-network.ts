// Pure helpers for trusted MANGOI teacher network classification.
// IMPORTANT: the public /api/vc/quality-log request body is untrusted.
// The server must derive HOME/OFFICE from teacher profile metadata, never from b.teacher_network_type.

export type TeacherNetworkType = 'HOME' | 'OFFICE' | 'UNKNOWN';

export function teacherNetworkTypeFromGroup(groupName: unknown): TeacherNetworkType {
  const raw = String(groupName ?? '').trim().toLowerCase();
  if (!raw) return 'UNKNOWN';

  // Existing teacher roster groups include labels such as Home-based / Office.
  // Keep matching deliberately narrow. Unknown/new labels stay UNKNOWN rather than being guessed.
  if (/^(home[- _]?based|home|재택)$/.test(raw)) return 'HOME';
  if (/^(office|office[- _]?based|office[- _]?teacher|사무실)$/.test(raw)) return 'OFFICE';
  return 'UNKNOWN';
}

export function sanitizeTeacherNetworkType(value: unknown): TeacherNetworkType {
  return value === 'HOME' || value === 'OFFICE' ? value : 'UNKNOWN';
}
