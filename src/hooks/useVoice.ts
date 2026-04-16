import { useState, useCallback } from 'react';

export function useVoice() {
  const [enabled, setEnabled] = useState(true);

  const speak = useCallback((text: string) => {
    if (!enabled || !('speechSynthesis' in window)) return;
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  }, [enabled]);

  return { speak, enabled, setEnabled };
}
