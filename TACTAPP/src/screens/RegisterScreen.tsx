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
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';

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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user types
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.username.trim()) {
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
    if (!validate()) return;

    const result = await register({
      username: formData.username,
      email: formData.email,
      phone: formData.phone,
      password: formData.password,
      whatsapp: formData.whatsapp,
      line: formData.line,
      rememberMe: false,
    });

    if (result.success) {
      // แสดง Alert แล้วกลับไปหน้า Login
      Alert.alert(
        t('success'),
        t('registerSuccess'),
        [
          {
            text: t('login'),
            onPress: () => onNavigateBack(), // กลับไปหน้า Login
          },
        ],
        { cancelable: false }
      );
    } else {
      // แสดง error
      Alert.alert(t('error'), result.message || t('registerFailed'));
    }
  };

  const renderInput = (
    field: string,
    label: string,
    placeholder: string,
    options?: {
      keyboardType?: 'default' | 'email-address' | 'phone-pad';
      secureTextEntry?: boolean;
      showToggle?: boolean;
      isVisible?: boolean;
      onToggle?: () => void;
    }
  ) => (
    <View className="mb-4">
      <Text className="text-gray-600 mb-2">{label}</Text>
      <View className="relative">
        <TextInput
          className={`border rounded-lg px-4 py-3 text-base bg-white ${
            errors[field] ? 'border-red-500' : 'border-gray-300'
          } ${options?.showToggle ? 'pr-12' : ''}`}
          placeholder={placeholder}
          placeholderTextColor="#9ca3af"
          value={formData[field as keyof typeof formData]}
          onChangeText={(value) => updateField(field, value)}
          keyboardType={options?.keyboardType || 'default'}
          secureTextEntry={options?.secureTextEntry && !options?.isVisible}
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
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View className="flex-row justify-between items-center p-4 pt-12">
          <TouchableOpacity onPress={onNavigateBack}>
            <Ionicons name="close" size={28} color="#333" />
          </TouchableOpacity>
          <Image
            source={require('../../assets/images/LOGOblack.png')}
            style={{ width: 100, height: 25 }}
            resizeMode="contain"
          />
          <View style={{ width: 28 }} />
        </View>

        {/* Form */}
        <View className="flex-1 px-6 pt-4">
          <Text className="text-2xl font-bold text-gray-800 mb-6">{t('register')}</Text>

          {renderInput('username', t('username'), t('username'))}
          {renderInput('email', t('email'), t('email'), { keyboardType: 'email-address' })}
          {renderInput('phone', t('phone'), t('phone'), { keyboardType: 'phone-pad' })}
          {renderInput('password', t('password'), t('password'), {
            secureTextEntry: true,
            showToggle: true,
            isVisible: showPassword,
            onToggle: () => setShowPassword(!showPassword),
          })}
          {renderInput('confirmPassword', t('confirmPassword'), t('confirmPassword'), {
            secureTextEntry: true,
            showToggle: true,
            isVisible: showConfirmPassword,
            onToggle: () => setShowConfirmPassword(!showConfirmPassword),
          })}
          {renderInput('whatsapp', t('whatsapp'), t('whatsapp'))}
          {renderInput('line', t('line'), t('line'))}

          {/* Terms Checkbox */}
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
            className={`rounded-lg py-4 items-center mb-6 ${
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