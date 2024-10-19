import { ViewStyle } from 'react-native';

export const alignHorizontal: ViewStyle = {
  flexDirection: 'row',
  alignItems: 'center',
};

export const alignVertical: ViewStyle = {
  flexDirection: 'column',
  justifyContent: 'center',
};

export const spacedRow: ViewStyle = {
  flexDirection: 'row',
  justifyContent: 'space-between',
};

export const spacedColumn: ViewStyle = {
  flexDirection: 'column',
  justifyContent: 'space-between',
};

export const center: ViewStyle = {
  justifyContent: 'center',
  alignItems: 'center',
};

export const stretch: ViewStyle = {
  alignItems: 'stretch',
};

export const justifyCenter: ViewStyle = {
  justifyContent: 'center',
};

export const alignStart: ViewStyle = {
  alignItems: 'flex-start',
};

export const alignSelfStart: ViewStyle = {
  alignSelf: 'flex-start',
};

export const alignCenter: ViewStyle = {
  alignSelf: 'center',
};

export const alignEnd: ViewStyle = {
  alignSelf: 'flex-end',
};

export const alignItemsEnd: ViewStyle = {
  alignItems: 'flex-end',
};

export const item: ItemStyle = {
  fill: { flex: 1 },
  grow: { flexGrow: 1 },
  center: { alignSelf: 'center' },
  stretch: { alignSelf: 'stretch' },
};

export const row: ViewStyle = {
  flexDirection: 'row',
};

export const rowReverse: ViewStyle = {
  flexDirection: 'row-reverse',
};

export const wrap: ViewStyle = {
  flexWrap: 'wrap',
};

type ItemStyle = Record<'fill' | 'grow' | 'center' | 'stretch', ViewStyle>;
