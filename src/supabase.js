import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://lmiaajtuhlcapfyuvqwl.supabase.co";
const SUPABASE_KEY = "sb_publishable_K2dmKFAX0xZeY-eOsiIv6A_2lNUBRI_";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
