import { cache } from 'react';
import { getDb } from './db';
import { getOwnerRestaurant } from './owner-menu';

/** The owner's restaurant, read once per page request even when the layout and the page both ask. */
export const getMyRestaurant = cache((ownerId: string) => getOwnerRestaurant(getDb(), ownerId));
