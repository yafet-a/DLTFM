'use client';

import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

type AuthMode = 'signin' | 'signup';

export const LoginScreen = () => {
  const { signInWithEmail } = useAuth();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setIsLoading(true);

    try {
      if (mode === 'signup') {
        await signInWithEmail(email, password, true);
        setMessage('Check your email for the confirmation link');
      } else {
        await signInWithEmail(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Welcome to DLTFM</h1>
          <p className="text-gray-600 mt-2">
            Distributed Ledger Technology File Manager
          </p>
        </div>

        {/* Toggle buttons */}
        <div className="flex rounded-lg bg-gray-100 p-1 mb-6">
          <button
            className={`flex-1 py-2 text-sm font-medium rounded-md ${
              mode === 'signin'
                ? 'bg-white text-gray-900 shadow'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setMode('signin')}
          >
            Sign In
          </button>
          <button
            className={`flex-1 py-2 text-sm font-medium rounded-md ${
              mode === 'signup'
                ? 'bg-white text-gray-900 shadow'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setMode('signup')}
          >
            Sign Up
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 text-sm text-red-800 bg-red-50 rounded-lg">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-4 p-4 text-sm text-green-800 bg-green-50 rounded-lg">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              className="mt-1 block w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              className="mt-1 block w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === 'signup' && (
              <p className="mt-1 text-xs text-gray-500">
                Password must be at least 6 characters long
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading 
              ? (mode === 'signup' ? 'Signing up...' : 'Signing in...') 
              : (mode === 'signup' ? 'Sign up' : 'Sign in')}
          </button>
        </form>
      </div>
    </div>
  );
};

export const UserMenu = () => {
  const { user, signOut } = useAuth();

  return (
    <div className="flex items-center space-x-2 text-gray-700">
      <span className="font-medium">{user?.email}</span>
      <button
        onClick={() => signOut()}
        className="ml-2 p-1 hover:bg-gray-100 rounded-full"
        title="Sign out"
      >
        Sign out
      </button>
    </div>
  );
};