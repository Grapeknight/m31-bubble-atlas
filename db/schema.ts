import {sqliteTable,text,integer,real,index} from 'drizzle-orm/sqlite-core';
export const profiles=sqliteTable('profiles',{
 id:text('id').primaryKey(),name:text('name').notNull(),normalizedName:text('normalized_name').notNull().unique(),createdAt:text('created_at').notNull(),role:text('role',{enum:['standard','advanced']}).notNull().default('standard'),accessCodeHash:text('access_code_hash'),
});
export const profileSessions=sqliteTable('profile_sessions',{
 tokenHash:text('token_hash').primaryKey(),profileId:text('profile_id').notNull(),expiresAt:text('expires_at').notNull(),accessCodeHash:text('access_code_hash'),
},t=>[index('sessions_expiry').on(t.expiresAt)]);
export const bubbles=sqliteTable('bubbles',{
 id:text('id').primaryKey(),userId:text('user_id').notNull(),mapId:text('map_id').notNull(),name:text('name').notNull(),notes:text('notes').notNull().default(''),confidence:text('confidence').notNull().default('candidate'),
 x:real('x').notNull(),y:real('y').notNull(),rx:real('rx').notNull(),ry:real('ry').notNull(),theta:real('theta').notNull(),ra:real('ra').notNull(),dec:real('dec').notNull(),aArcsec:real('a_arcsec').notNull(),bArcsec:real('b_arcsec').notNull(),paDeg:real('pa_deg').notNull(),paDefined:integer('pa_defined',{mode:'boolean'}).notNull(),revision:integer('revision').notNull().default(1),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[index('bubbles_owner_updated').on(t.userId,t.updatedAt)]);
