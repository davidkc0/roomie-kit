
import { useState, useEffect, useRef } from 'react';
import { Keyboard } from '@capacitor/keyboard';
import { Capacitor } from '@capacitor/core';

export function useKeyboardAdjust(options: { offset?: number } = {}) {
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const contentRef = useRef<HTMLDivElement>(null);
    const { offset = 20 } = options;

    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;

        // AccessoryBar control is handled globally in App.tsx now

        const showHandle = Keyboard.addListener('keyboardWillShow', info => {
            setKeyboardHeight(info.keyboardHeight);
        });

        const hideHandle = Keyboard.addListener('keyboardWillHide', () => {
            setKeyboardHeight(0);
        });

        return () => {
            showHandle.then(h => h.remove());
            hideHandle.then(h => h.remove());
        };
    }, []);

    // Auto-scroll active input into view
    useEffect(() => {
        if (keyboardHeight > 0 && contentRef.current) {
            // Delay for layout update
            setTimeout(() => {
                const activeElement = document.activeElement;
                if (activeElement && activeElement.tagName === 'INPUT') {
                    activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
        }
    }, [keyboardHeight]);

    // Return the styles/props to apply
    return {
        contentRef,
        containerStyle: {
            paddingBottom: keyboardHeight > 0 ? keyboardHeight + offset : 16,
            transition: 'padding-bottom 0.3s ease-out', // Smooth transition
        },
        keyboardHeight
    };
}
