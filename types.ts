
export enum Language {
  ENGLISH = 'English',
  SPANISH = 'Spanish',
  FRENCH = 'French',
  GERMAN = 'German',
  JAPANESE = 'Japanese',
  CHINESE = 'Mandarin Chinese',
  ITALIAN = 'Italian',
  PORTUGUESE = 'Portuguese',
  KOREAN = 'Korean',
  URDU = 'Urdu'
}

export enum Proficiency {
  BEGINNER = 'Beginner',
  INTERMEDIATE = 'Intermediate',
  ADVANCED = 'Advanced'
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export interface TranscriptionEntry {
  role: 'user' | 'ai';
  text: string;
  timestamp: number;
}
