
import React from 'react';
import { Scenario } from './types';

export const SCENARIOS: Scenario[] = [
  {
    id: 'casual_chat',
    name: 'Casual Conversation',
    description: 'A relaxed chat about hobbies, weather, and daily life.',
    icon: 'fa-comments'
  },
  {
    id: 'coffee_shop',
    name: 'At the Cafe',
    description: 'Order your favorite drink and pastry in a bustling cafe.',
    icon: 'fa-coffee'
  },
  {
    id: 'job_interview',
    name: 'Job Interview',
    description: 'Practice professional vocabulary and answer challenging questions.',
    icon: 'fa-briefcase'
  },
  {
    id: 'travel_airport',
    name: 'Airport Check-in',
    description: 'Navigate through check-in, security, and boarding.',
    icon: 'fa-plane'
  },
  {
    id: 'doctor_visit',
    name: 'Medical Appointment',
    description: 'Describe symptoms and understand medical advice.',
    icon: 'fa-user-md'
  },
  {
    id: 'apartment_renting',
    name: 'Renting an Apartment',
    description: 'Inquire about features, price, and lease terms.',
    icon: 'fa-home'
  }
];
