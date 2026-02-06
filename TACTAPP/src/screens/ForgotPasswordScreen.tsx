// C:\Users\Asus\Documents\TACT\TACTAPP\src\screens\ForgotPasswordScreen.tsx
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
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../contexts/LanguageContext';
import { Header } from '../components/Header';
import { apiClient } from '../services/api';

interface ForgotPasswordScreenProps {
  onNavigateBack: () => void;
  onResetSuccess: () => void;
}

export const ForgotPasswordScreen: React.FC<ForgotPasswordScreenProps> = ({
  onNavigateBack,
  onResetSuccess,
}) => {
  const { t } = useLanguage();

  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const validateEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSubmit = async () => {
    // Validate
    if (!email) {
      setError(t('required'));
      return;
    }

    if (!validateEmail(email)) {
      setError(t('invalidEmail'));
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const response = await apiClient.forgotPassword(email);

      if (response.success) {
        // DEV MODE: Show temp password
        if (response.data?.tempPassword) {
          setTempPassword(response.data.tempPassword);
        } else {
          // PRODUCTION: Show success message
          Alert.alert(
            t('success'),
            t('resetEmailSent'),
            [{ text: 'OK', onPress: onResetSuccess }]
          );
        }
      } else {
        Alert.alert(t('error'), response.message || t('resetFailed'));
      }
    } catch (err) {
      Alert.alert(t('error'), t('networkError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyPassword = () => {
    // In a real app, you'd use Clipboard API
    Alert.alert(
      t('tempPassword'),
      `${t('yourTempPassword')}: ${tempPassword}\n\n${t('pleaseLoginAndChange')}`,
      [{ text: 'OK', onPress: onResetSuccess }]
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-white"
    >
      {/* Header with Logo */}
      <Header showClose onClose={onNavigateBack} />

      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="px-6 pt-8">
          {/* Title */}
          <Text className="text-2xl font-bold text-gray-800 mb-2">
            {t('forgotPassword')}
          </Text>
          <Text className="text-gray-500 mb-8">
            {t('forgotPasswordDesc')}
          </Text>

          {!tempPassword ? (
            // Step 1: Enter email
            <>
              {/* Email Input */}
              <View className="mb-6">
                <Text className="text-gray-600 mb-2">{t('email')}</Text>
                <View className="relative">
                  <View className="absolute left-4 top-3 z-10">
                    <Ionicons name="mail-outline" size={24} color="#9ca3af" />
                  </View>
                  <TextInput
                    className={`border rounded-lg pl-12 pr-4 py-3 text-base bg-white ${
                      error ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder={t('enterEmail')}
                    placeholderTextColor="#9ca3af"
                    value={email}
                    onChangeText={(text) => {
                      setEmail(text);
                      if (error) setError('');
                    }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                {error && (
                  <Text className="text-red-500 text-sm mt-1">{error}</Text>
                )}
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                className={`rounded-lg py-4 items-center ${
                  isLoading ? 'bg-gray-400' : 'bg-green-500'
                }`}
                onPress={handleSubmit}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-semibold text-base">
                    {t('resetPassword')}
                  </Text>
                )}
              </TouchableOpacity>

              {/* Back to Login */}
              <TouchableOpacity
                className="mt-6 items-center"
                onPress={onNavigateBack}
              >
                <Text className="text-gray-500">
                  {t('rememberPassword')}{' '}
                  <Text className="text-green-500 font-semibold">{t('login')}</Text>
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            // Step 2: Show temp password (DEV MODE)
            <View className="items-center">
              {/* Success Icon */}
              <View className="w-20 h-20 bg-green-100 rounded-full items-center justify-center mb-6">
                <Ionicons name="checkmark-circle" size={48} color="#22c55e" />
              </View>

              <Text className="text-lg text-gray-800 text-center mb-4">
                {t('tempPasswordGenerated')}
              </Text>

              {/* Temp Password Box */}
              <View className="bg-gray-100 rounded-lg px-6 py-4 w-full mb-4">
                <Text className="text-center text-gray-500 text-sm mb-2">
                  {t('yourTempPassword')}
                </Text>
                <Text className="text-center text-2xl font-bold text-gray-800 tracking-wider">
                  {tempPassword}
                </Text>
              </View>

              <Text className="text-gray-500 text-center text-sm mb-6">
                {t('tempPasswordExpires')}
              </Text>

              {/* Back to Login Button */}
              <TouchableOpacity
                className="bg-green-500 rounded-lg py-4 items-center w-full"
                onPress={handleCopyPassword}
              >
                <Text className="text-white font-semibold text-base">
                  {t('backToLogin')}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};