'use client';
import {createContext,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';
import english from '../lib/english.json';
export type Language='zh'|'en';
const dictionary=english as Record<string,string>;
export function translate(text:string,language:Language){
 if(language==='zh')return text;
 const key=text.trim(),entry=dictionary[key];
 if(entry!==undefined)return (text.match(/^\s*/)?.[0]||'')+entry+(text.match(/\s*$/)?.[0]||'');
 const exported=/^已导出 (\d+) 个已保存气泡$/.exec(text);if(exported)return `Exported ${exported[1]} saved bubbles`;
 const log=/^Log · 强度 (.+)$/.exec(text);if(log)return `Log · Strength ${log[1]}`;
 return text;
}
const Context=createContext<{language:Language;setLanguage:(v:Language)=>void;t:(s:string)=>string}>({language:'zh',setLanguage:()=>{},t:s=>s});
export function LanguageProvider({children}:{children:ReactNode}){
 const [language,setLanguageState]=useState<Language>('zh');
 useEffect(()=>{try{if(localStorage.getItem('m31-language')==='en')setLanguageState('en');}catch{}},[]);
 const setLanguage=(v:Language)=>{setLanguageState(v);try{localStorage.setItem('m31-language',v);}catch{}};
 useEffect(()=>{document.documentElement.lang=language==='zh'?'zh-CN':'en';document.title=language==='zh'?'空泡捕手计划 · 仙女座空泡搜寻':'Bubble Catchers Project · Andromeda Bubble Search';},[language]);
 const value=useMemo(()=>({language,setLanguage,t:(s:string)=>translate(s,language)}),[language]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useI18n(){return useContext(Context);}
