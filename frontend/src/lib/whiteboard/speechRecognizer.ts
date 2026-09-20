/**
 * frontend/lib/whiteboard/speechRecognizer.ts
 *
 * Browser Speech-to-Text (STT) Controller using Web Speech API.
 * Captures spoken student questions during turn-based interruptions.
 */

export class SpeechRecognizer {
  private recognition: any = null;
  private listening: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recog = new SpeechRecognition();
        recog.continuous = false;
        recog.interimResults = true;
        recog.lang = 'en-US';
        this.recognition = recog;
      }
    }
  }

  public isSupported(): boolean {
    return this.recognition !== null;
  }

  public isListening(): boolean {
    return this.listening;
  }

  public start(
    onResult: (text: string, isFinal: boolean) => void,
    onError?: (err: any) => void
  ) {
    if (!this.recognition) {
      onError?.(new Error('SpeechRecognition is not supported in this browser.'));
      return;
    }

    this.recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      onResult(final || interim, !!final);
    };

    this.recognition.onerror = (event: any) => {
      console.warn('SpeechRecognition error:', event.error);
      this.listening = false;
      onError?.(event.error);
    };

    this.recognition.onend = () => {
      this.listening = false;
    };

    try {
      this.recognition.start();
      this.listening = true;
    } catch (err) {
      console.warn('SpeechRecognition already started or error:', err);
    }
  }

  public stop() {
    if (this.recognition && this.listening) {
      try {
        this.recognition.stop();
      } catch (err) {
        // ignore
      }
      this.listening = false;
    }
  }
}