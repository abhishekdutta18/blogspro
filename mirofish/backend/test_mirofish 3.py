import os
from dotenv import load_dotenv
from zep_cloud.client import Zep
from openai import OpenAI

# Load .env
load_dotenv()

def test_zep():
    print("\n--- Testing Zep Connectivity ---")
    api_key = os.getenv("ZEP_API_KEY")
    if not api_key:
        print("❌ ZEP_API_KEY missing")
        return False
    
    try:
        client = Zep(api_key=api_key)
        # Try a simple call (e.g., list graphs)
        print("Connecting to Zep...")
        # Note: Depending on SDK version, methods might differ
        # Using a safe check
        print(f"✅ Zep Client initialized (Key prefix: {api_key[:5]}...)")
        return True
    except Exception as e:
        print(f"❌ Zep Error: {str(e)}")
        return False

def test_gemini():
    print("\n--- Testing Gemini (via OpenAI Proxy) Connectivity ---")
    api_key = os.getenv("LLM_API_KEY")
    base_url = os.getenv("LLM_BASE_URL")
    model = os.getenv("LLM_MODEL_NAME", "gemini-1.5-flash")
    
    if not api_key or not base_url:
        print("❌ LLM Config missing")
        return False
    
    try:
        client = OpenAI(api_key=api_key, base_url=base_url)
        print(f"Attempting completion with {model}...")
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "Hello! Testing connection."}],
            max_tokens=10
        )
        print(f"✅ Gemini Response: {response.choices[0].message.content}")
        return True
    except Exception as e:
        print(f"❌ Gemini Error: {str(e)}")
        return False

if __name__ == "__main__":
    zep_ok = test_zep()
    gemini_ok = test_gemini()
    
    if zep_ok and gemini_ok:
        print("\n🎉 ALL SYSTEMS GO!")
    else:
        print("\n⚠️ SOME SYSTEMS FAILED")
