import { createClient } from '@supabase/supabase-js'

// Reemplaza los valores de abajo con las llaves de tu proyecto de Supabase
const supabaseUrl = 'https://vlocmihizoqttibermcb.supabase.co/'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZsb2NtaWhpem9xdHRpYmVybWNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1Mjc0MTYsImV4cCI6MjA5NjEwMzQxNn0.XRtNbV-sBBSdw68TvkzzT4n-MXGGyuzBxN82aM17hlc'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)