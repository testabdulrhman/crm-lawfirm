import { create } from 'zustand'
import { storage } from '@/lib/storage'

export type DateDisplay = 'dual' | 'hijri' | 'gregorian'

const STORAGE_KEY = 'crm-date-display'

function getInitial(): DateDisplay {
  const v = storage.getItem(STORAGE_KEY)
  if (v === 'dual' || v === 'hijri' || v === 'gregorian') return v
  return 'dual'
}

interface PrefsState {
  dateDisplay: DateDisplay
  setDateDisplay: (v: DateDisplay) => void
}

export const usePrefs = create<PrefsState>((set) => ({
  dateDisplay: getInitial(),
  setDateDisplay: (v) => {
    storage.setItem(STORAGE_KEY, v)
    set({ dateDisplay: v })
  },
}))

// قارئ غير-تفاعلي لاستخدامه في دوال التنسيق (format.ts)
export const getDateDisplay = (): DateDisplay => usePrefs.getState().dateDisplay
