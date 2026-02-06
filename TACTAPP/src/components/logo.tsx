import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';

interface LogoProps {
  size?: 'small' | 'medium' | 'large';
  style?: StyleProp<ImageStyle>;
}

const sizes = {
  small: { width: 80, height: 20 },
  medium: { width: 120, height: 30 },
  large: { width: 230, height: 57 },
};

export const Logo: React.FC<LogoProps> = ({ size = 'medium', style }) => {
  const dimensions = sizes[size];
  
  return (
    <Image
      source={require('../../assets/images/LOGOblack.png')}
      style={[dimensions, style]}
      resizeMode="contain"
    />
  );
};