// ShelfColors.js
// Export an array of shelf color hex codes. Add new colors to this array.
// Each scheme is a full set of colors for a shelf style (wood type)
export const SHELF_COLOR_SCHEMES = [
  {
    name: 'Classic',
    ledgeGradient: ['#FF6A28', '#E0502A', '#B43A2A'],
    ledgeBg: '#FA6424',
    highlightLeft: '#FF9F45',
    highlightRight: '#FF9A3E',
    cornerShade: '#ff8a37',
    bandDivider: '#A63A3A',
    bandUpperGradient: ['#8A2D35', '#65243A'],
    bandUpperBg: '#a84615',
    bandLowerGradient: ['#592344', '#3D1736'],
    bandLowerBg: '#611c45',
    bottomHighlightLeft: '#FF9F4A',
    bottomHighlightRight: '#FF9742',
    bottomCornerShade: '#f44d2c',
    bottomBandDivider: '#9A3438',
    // Add more as needed for all shelf parts
  },
  // Example: add a lighter birch wood style
  {
    name: 'Birch',
    ledgeGradient: ['#F7E9C4', '#E6D3A3', '#CBB994'],
    ledgeBg: '#F7E9C4',
    highlightLeft: '#FFF3D1',
    highlightRight: '#FFE7A0',
    cornerShade: '#E6D3A3',
    bandDivider: '#CBB994',
    bandUpperGradient: ['#E6D3A3', '#CBB994'],
    bandUpperBg: '#E6D3A3',
    bandLowerGradient: ['#CBB994', '#B8A07A'],
    bandLowerBg: '#B8A07A',
    bottomHighlightLeft: '#FFF3D1',
    bottomHighlightRight: '#FFE7A0',
    bottomCornerShade: '#E6D3A3',
    bottomBandDivider: '#B8A07A',
  },
  // Example: dark walnut
  {
    name: 'Walnut',
    ledgeGradient: ['#7B5E3B', '#5C4321', '#3B2A14'],
    ledgeBg: '#7B5E3B',
    highlightLeft: '#BFA074',
    highlightRight: '#A88B5A',
    cornerShade: '#5C4321',
    bandDivider: '#3B2A14',
    bandUpperGradient: ['#5C4321', '#3B2A14'],
    bandUpperBg: '#5C4321',
    bandLowerGradient: ['#3B2A14', '#2A1B0E'],
    bandLowerBg: '#2A1B0E',
    bottomHighlightLeft: '#BFA074',
    bottomHighlightRight: '#A88B5A',
    bottomCornerShade: '#5C4321',
    bottomBandDivider: '#2A1B0E',
  },
  // Add more wood styles as desired
];
