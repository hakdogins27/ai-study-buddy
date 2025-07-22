import google.generativeai as genai

genai.configure(api_key="AIzaSyDve51pxejSauFBS_p0dxjdPCjr1WGB2Ww")

models = genai.list_models()
for model in models:
    print(model.name, "→", model.supported_generation_methods)
