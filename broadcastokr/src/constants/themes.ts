import type { Theme } from '../types';

const DARK: Theme = {
  bg: '#0B0F19',
  bgCard: '#111827',
  bgCardHover: '#232E45',
  bgSidebar: '#111827',
  bgSidebarActive: '#2A3855',
  bgInput: '#1C2333',
  bgMuted: '#1C2333',
  border: '#1F2D45',
  borderLight: '#1F2D45',
  borderInput: '#2E3F5C',
  text: '#F0F4FF',
  textSecondary: '#9BAAC4',
  textMuted: '#5E6F8A',
  textFaint: '#3D4F68',
  sidebarText: '#5E6F8A',
  sidebarTextActive: '#5B33F0',
  overlay: 'rgba(0,0,0,.7)',
  headerBg: '#111827',
  compliantBg: '#051412',
  compliantBorder: '#0F5E56',
  atRiskBg: '#1A0505',
  atRiskBorder: '#7A1515',
};

export const THEMES: { light: Theme; dark: Theme } = {
  light: DARK,
  dark: DARK,
};
