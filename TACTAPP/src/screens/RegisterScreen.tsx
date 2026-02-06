// C:\Users\Asus\Documents\TACT\TACTAPP\src\screens\RegisterScreen.tsx
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
import { useAuth } from '../contexts/AuthContext';
import { Header } from '../components/Header';

interface RegisterScreenProps {
  onNavigateBack: () => void;
  onRegisterSuccess: () => void;
}

export const RegisterScreen: React.FC<RegisterScreenProps> = ({
  onNavigateBack,
  onRegisterSuccess,
}) => {
  const { t } = useLanguage();
  const { register, isLoading } = useAuth();

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    whatsapp: '',
    line: '',
  });
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.username) {
      newErrors.username = t('required');
    }

    if (!formData.email) {
      newErrors.email = t('required');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = t('invalidEmail');
    }

    if (!formData.phone) {
      newErrors.phone = t('required');
    } else if (!/^[0-9]{9,10}$/.test(formData.phone.replace(/[-\s]/g, ''))) {
      newErrors.phone = t('invalidPhone');
    }

    if (!formData.password) {
      newErrors.password = t('required');
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = t('required');
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = t('passwordMismatch');
    }

    if (!agreeTerms) {
      newErrors.terms = t('mustAgreeTerms');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validateForm()) {
      return;
    }

    const success = await register({
      username: formData.username,
      email: formData.email,
      phone: formData.phone,
      password: formData.password,
      whatsapp: formData.whatsapp,
      line: formData.line,
      rememberMe: false,
    });

    if (success) {
      onRegisterSuccess();
    } else {
      Alert.alert('Error', 'Registration failed. Please try again.');
    }
  };

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const renderInput = (
    field: string,
    placeholder: string,
    options?: {
      secureTextEntry?: boolean;
      showToggle?: boolean;
      isVisible?: boolean;
      onToggle?: () => void;
      keyboardType?: 'default' | 'email-address' | 'phone-pad';
    }
  ) => (
    <View className="mb-4">
      <Text className="text-gray-600 mb-2">{placeholder}</Text>
      <View className="relative">
        <TextInput
          className={`border rounded-lg px-4 py-3 text-base bg-white ${
            errors[field] ? 'border-red-500' : 'border-gray-300'
          } ${options?.showToggle ? 'pr-12' : ''}`}
          placeholder={placeholder}
          placeholderTextColor="#9ca3af"
          value={formData[field as keyof typeof formData]}
          onChangeText={(value) => updateField(field, value)}
          secureTextEntry={options?.secureTextEntry && !options?.isVisible}
          keyboardType={options?.keyboardType || 'default'}
          autoCapitalize={field === 'email' ? 'none' : 'sentences'}
        />
        {options?.showToggle && (
          <TouchableOpacity
            className="absolute right-4 top-3"
            onPress={options.onToggle}
          >
            <Ionicons
              name={options.isVisible ? 'eye-off' : 'eye'}
              size={24}
              color="#9ca3af"
            />
          </TouchableOpacity>
        )}
      </View>
      {errors[field] && (
        <Text className="text-red-500 text-sm mt-1">{errors[field]}</Text>
      )}
    </View>
  );

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
        {/* Title */}
        <View className="px-6 mb-4">
          <Text className="text-2xl font-bold text-gray-800">{t('register')}</Text>
        </View>

        {/* Register Form */}
        <View className="px-6">
          {renderInput('username', t('username'))}
          {renderInput('email', t('email'), { keyboardType: 'email-address' })}
          {renderInput('phone', t('phone'), { keyboardType: 'phone-pad' })}
          {renderInput('password', t('password'), {
            secureTextEntry: true,
            showToggle: true,
            isVisible: showPassword,
            onToggle: () => setShowPassword(!showPassword),
          })}
          {renderInput('confirmPassword', t('confirmPassword'), {
            secureTextEntry: true,
            showToggle: true,
            isVisible: showConfirmPassword,
            onToggle: () => setShowConfirmPassword(!showConfirmPassword),
          })}
          {renderInput('whatsapp', t('whatsapp'))}
          {renderInput('line', t('line'))}

          {/* Terms & Conditions */}
          <TouchableOpacity
            className="flex-row items-start mb-6"
            onPress={() => setAgreeTerms(!agreeTerms)}
          >
            <View
              className={`w-5 h-5 border rounded mr-3 mt-0.5 items-center justify-center ${
                agreeTerms ? 'bg-green-500 border-green-500' : 'border-gray-300'
              }`}
            >
              {agreeTerms && <Ionicons name="checkmark" size={14} color="white" />}
            </View>
            <Text className="text-gray-600 flex-1 text-sm">
              {t('agreeTerms')}
            </Text>
          </TouchableOpacity>
          {errors.terms && (
            <Text className="text-red-500 text-sm mb-4 -mt-4">{errors.terms}</Text>
          )}

          {/* Register Button */}
          <TouchableOpacity
            className={`rounded-lg py-4 items-center mb-8 ${
              isLoading ? 'bg-gray-400' : 'bg-green-500'
            }`}
            onPress={handleRegister}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-semibold text-base">{t('register')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};