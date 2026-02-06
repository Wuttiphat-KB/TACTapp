// C:\Users\Asus\Documents\TACT\TACTAPP\src\screens\LoginScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';

interface LoginScreenProps {
  onNavigateToRegister: () => void;
  onNavigateToForgotPassword: () => void;
  onLoginSuccess: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onNavigateToRegister,
  onNavigateToForgotPassword,
  onLoginSuccess,
}) => {
  const { t } = useLanguage();
  const { login, isLoading } = useAuth();
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    // ===== BYPASS MODE: ใส่อะไรก็ได้ผ่าน =====
    // TODO: เปลี่ยนเป็น validation จริงเมื่อทำ backend
    
    if (!username || !password) {
      setError(t('required'));
      return;
    }

    setError('');
    const success = await login(username, password, rememberMe);
    if (success) {
      onLoginSuccess();
    } else {
      setError('Login failed. Please try again.');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-white"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header with Logo */}
        <View className="flex-row justify-center items-center p-4 pt-12">
          {/* TACT Logo */}
          <Image
            source={require('../../assets/images/LOGOblack.png')}
            style={{ width: 100, height: 25 }}
            resizeMode="contain"
          />
        </View>

        {/* Login Form */}
        <View className="flex-1 px-6 pt-8">
          {/* Username Input */}
          <View className="mb-4">
            <Text className="text-gray-600 mb-2">{t('username')}</Text>
            <TextInput
              className="border border-gray-300 rounded-lg px-4 py-3 text-base bg-white"
              placeholder={t('username')}
              placeholderTextColor="#9ca3af"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
            />
          </View>

          {/* Password Input */}
          <View className="mb-4">
            <Text className="text-gray-600 mb-2">{t('password')}</Text>
            <View className="relative">
              <TextInput
                className="border border-gray-300 rounded-lg px-4 py-3 text-base pr-12 bg-white"
                placeholder={t('password')}
                placeholderTextColor="#9ca3af"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                className="absolute right-4 top-3"
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={24}
                  color="#9ca3af"
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Remember Me & Forgot Password */}
          <View className="flex-row justify-between items-center mb-6">
            <TouchableOpacity
              className="flex-row items-center"
              onPress={() => setRememberMe(!rememberMe)}
            >
              <View
                className={`w-5 h-5 border rounded mr-2 items-center justify-center ${
                  rememberMe ? 'bg-green-500 border-green-500' : 'border-gray-300'
                }`}
              >
                {rememberMe && <Ionicons name="checkmark" size={14} color="white" />}
              </View>
              <Text className="text-gray-600">{t('rememberMe')}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={onNavigateToForgotPassword}>
              <Text className="text-red-500">{t('forgotPassword')}</Text>
            </TouchableOpacity>
          </View>

          {/* Error Message */}
          {error ? (
            <Text className="text-red-500 text-center mb-4">{error}</Text>
          ) : null}

          {/* Login Button */}
          <TouchableOpacity
            className={`rounded-lg py-4 items-center ${
              isLoading ? 'bg-gray-400' : 'bg-green-500'
            }`}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-semibold text-base">{t('login')}</Text>
            )}
          </TouchableOpacity>

          {/* Register Link */}
          <TouchableOpacity
            className="items-center mt-4"
            onPress={onNavigateToRegister}
          >
            <Text className="text-blue-500 underline">{t('register')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};