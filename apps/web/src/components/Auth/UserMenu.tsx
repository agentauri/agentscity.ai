/**
 * User Menu Component
 *
 * Displays user info when authenticated, or sign in button when not.
 * Includes dropdown menu with logout option.
 */

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore, useUser, useIsAuthenticated } from '../../stores/auth';

interface UserMenuProps {
  onSignInClick: () => void;
}

export function UserMenu({ onSignInClick }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const user = useUser();
  const isAuthenticated = useIsAuthenticated();
  const logout = useAuthStore((s) => s.logout);

  // Update menu position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, [isOpen]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current && !menuRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setIsOpen(false);
    await logout();
  };

  // Not authenticated - show sign in button
  if (!isAuthenticated) {
    return (
      <button
        onClick={onSignInClick}
        className="h-8 px-3 bg-city-accent hover:bg-city-accent/90
                   text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        Sign In
      </button>
    );
  }

  // Authenticated - show user menu
  const displayName = user?.displayName || user?.email?.split('@')[0] || 'User';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <>
      {/* User Avatar Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="h-8 flex items-center gap-2 px-2 rounded-lg
                   hover:bg-city-border/50 transition-colors"
      >
        <div className="w-6 h-6 bg-city-accent rounded-full flex items-center justify-center">
          <span className="text-[10px] font-medium text-white">{initials}</span>
        </div>
        <span className="hidden sm:block text-xs text-city-text max-w-[100px] truncate">
          {displayName}
        </span>
        <svg
          className={`w-3 h-3 text-city-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu - rendered via portal to escape overflow:hidden */}
      {isOpen && createPortal(
        <div
          ref={menuRef}
          className="fixed w-56 bg-city-surface border border-city-border
                     rounded-lg shadow-xl z-[100] overflow-hidden"
          style={{ top: menuPosition.top, right: menuPosition.right }}
        >
          {/* User Info */}
          <div className="px-4 py-3 border-b border-city-border/50">
            <p className="text-sm font-medium text-city-text truncate">{displayName}</p>
            <p className="text-xs text-city-text-muted truncate">{user?.email}</p>
          </div>

          {/* Menu Items */}
          <div className="py-1">
            {/* Account badge if not verified */}
            {user && !user.isVerified && (
              <div className="px-4 py-2 flex items-center gap-2">
                <span className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded">
                  Unverified
                </span>
              </div>
            )}

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="w-full px-4 py-2 text-left text-sm text-city-text
                         hover:bg-city-border/50 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4 text-city-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
