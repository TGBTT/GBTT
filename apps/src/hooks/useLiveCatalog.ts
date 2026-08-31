/**
 * Hooks over the catalogue, site copy and studio settings.
 *
 * Each is a thin `useEffect` around its subscription, matching
 * `useLivePricing`. They are grouped in one file because the admin console
 * screen that edits them uses all three together.
 */

import { useEffect, useState } from 'react'
import {
  subscribeClassTypes,
  subscribeExercises,
  type LiveClassTypesState,
  type LiveExercisesState,
} from '@gbtt/shared/studio/firebase/liveClassTypes'
import {
  EMPTY_SITE_CONTENT,
  subscribeSiteContent,
  type LiveSiteContentState,
} from '@gbtt/shared/studio/firebase/liveSiteContent'
import {
  DEFAULT_TRANSFER_WINDOW_HOURS,
  subscribeSettings,
  type LiveSettingsState,
} from '@gbtt/shared/studio/firebase/liveSettings'

export function useLiveClassTypes() {
  const [state, setState] = useState<LiveClassTypesState>({
    status: 'loading',
    classTypes: [],
  })

  useEffect(() => subscribeClassTypes(setState), [])

  return state
}

export function useLiveExercises() {
  const [state, setState] = useState<LiveExercisesState>({ status: 'loading', exercises: [] })

  useEffect(() => subscribeExercises(setState), [])

  return state
}

export function useLiveSiteContent() {
  const [state, setState] = useState<LiveSiteContentState>({
    status: 'loading',
    content: EMPTY_SITE_CONTENT,
  })

  useEffect(() => subscribeSiteContent(setState), [])

  return state
}

export function useLiveSettings() {
  const [state, setState] = useState<LiveSettingsState>({
    status: 'loading',
    settings: { transferWindowHours: DEFAULT_TRANSFER_WINDOW_HOURS, equipmentChecked: [] },
  })

  useEffect(() => subscribeSettings(setState), [])

  return state
}
