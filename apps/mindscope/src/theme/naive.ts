import type { GlobalThemeOverrides } from 'naive-ui';

const font =
  "system-ui, -apple-system, 'Segoe UI', 'Microsoft YaHei UI', 'Microsoft YaHei', 'PingFang SC', 'Noto Sans SC', sans-serif";

export const lightOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#1F7A6D',
    primaryColorHover: '#2BA88F',
    primaryColorPressed: '#17635A',
    primaryColorSuppl: '#2BA88F',
    borderRadius: '10px',
    fontFamily: font,
  },
};

export const darkOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#3FBFA5',
    primaryColorHover: '#5FD3BB',
    primaryColorPressed: '#2E9C86',
    primaryColorSuppl: '#5FD3BB',
    borderRadius: '10px',
    fontFamily: font,
  },
};
