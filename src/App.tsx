import * as React from 'react';
import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Download, Settings, HelpCircle, Monitor, Smartphone, Globe, Layers, Volume2, VolumeX, Smartphone as PwaIcon, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import JSZip from 'jszip';
import confetti from 'canvas-confetti';
import { toast, Toaster } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

import { useVoice } from './hooks/useVoice';
import { createIco } from './lib/ico-encoder';

type Format = 'ICO' | 'PNG' | 'WEBSITE';

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [format, setFormat] = useState<Format>('ICO');
  const [isConverting, setIsConverting] = useState(false);
  const [generatedBlob, setGeneratedBlob] = useState<Blob | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isPwaInstalled, setIsPwaInstalled] = useState(false);
  
  const [selectedSizes, setSelectedSizes] = useState<number[]>([16, 32, 48, 64, 128, 256]);
  
  const { speak, enabled: voiceEnabled, setEnabled: setVoiceEnabled } = useVoice();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      toast.info('App is ready to install! Click anywhere to start.', {
        description: 'Install PNG To Icon for a faster, offline experience.',
        duration: 5000,
      });
    });

    window.addEventListener('appinstalled', () => {
      setIsPwaInstalled(true);
      setDeferredPrompt(null);
      toast.success('App installed successfully!');
      speak('App installed successfully!');
    });

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsPwaInstalled(true);
    }
  }, [speak]);

  // Attempt to trigger PWA install on first interaction
  useEffect(() => {
    const handleFirstInteraction = async () => {
      if (deferredPrompt) {
        try {
          await deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          if (outcome === 'accepted') {
            setDeferredPrompt(null);
          }
        } catch (err) {
          console.error('PWA prompt failed:', err);
        }
        window.removeEventListener('click', handleFirstInteraction);
        window.removeEventListener('touchstart', handleFirstInteraction);
      }
    };

    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('touchstart', handleFirstInteraction);
    return () => {
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };
  }, [deferredPrompt]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'image/png') {
      setFile(selectedFile);
      const previewUrl = URL.createObjectURL(selectedFile);
      setPreview(previewUrl);
      speak('File uploaded. Starting automatic conversion.');
      toast.success('PNG file uploaded');
      // Trigger conversion immediately
      setTimeout(() => autoConvert(selectedFile, previewUrl), 100);
    } else if (selectedFile) {
      toast.error('Please select a PNG file');
      speak('Please select a PNG file');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile && droppedFile.type === 'image/png') {
      setFile(droppedFile);
      const previewUrl = URL.createObjectURL(droppedFile);
      setPreview(previewUrl);
      speak('File dropped. Starting automatic conversion.');
      toast.success('PNG file uploaded');
      // Trigger conversion immediately
      setTimeout(() => autoConvert(droppedFile, previewUrl), 100);
    } else {
      toast.error('Please drop a PNG file');
      speak('Please drop a PNG file');
    }
  };

  const autoConvert = async (selectedFile: File, previewUrl: string) => {
    setIsConverting(true);
    setGeneratedBlob(null);
    if (generatedUrl) URL.revokeObjectURL(generatedUrl);
    setGeneratedUrl(null);

    try {
      const img = new Image();
      img.src = previewUrl;
      await new Promise((resolve) => (img.onload = resolve));

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      
      // High quality scaling
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      let finalBlob: Blob;
      let filename: string;

      if (format === 'ICO') {
        const sizes = [...selectedSizes].sort((a, b) => a - b);
        const blobs: Blob[] = [];
        for (const size of sizes) {
          const sizeCanvas = document.createElement('canvas');
          sizeCanvas.width = size;
          sizeCanvas.height = size;
          const sizeCtx = sizeCanvas.getContext('2d')!;
          
          sizeCtx.imageSmoothingEnabled = true;
          sizeCtx.imageSmoothingQuality = 'high';
          
          // Multi-step downscaling for better quality
          let currentCanvas = document.createElement('canvas');
          currentCanvas.width = img.width;
          currentCanvas.height = img.height;
          currentCanvas.getContext('2d')!.drawImage(img, 0, 0);
          
          while (currentCanvas.width > size * 2) {
            const nextCanvas = document.createElement('canvas');
            nextCanvas.width = Math.floor(currentCanvas.width / 2);
            nextCanvas.height = Math.floor(currentCanvas.height / 2);
            const nextCtx = nextCanvas.getContext('2d')!;
            nextCtx.imageSmoothingEnabled = true;
            nextCtx.imageSmoothingQuality = 'high';
            nextCtx.drawImage(currentCanvas, 0, 0, nextCanvas.width, nextCanvas.height);
            currentCanvas = nextCanvas;
          }
          
          const scale = Math.min(size / currentCanvas.width, size / currentCanvas.height);
          const x = (size - currentCanvas.width * scale) / 2;
          const y = (size - currentCanvas.height * scale) / 2;
          
          sizeCtx.drawImage(currentCanvas, x, y, currentCanvas.width * scale, currentCanvas.height * scale);
          
          const blob = await new Promise<Blob>((resolve) => sizeCanvas.toBlob((b) => resolve(b!), 'image/png'));
          blobs.push(blob);
        }
        finalBlob = await createIco(blobs, sizes);
        filename = 'icon.ico';
      } else if (format === 'PNG') {
        const zip = new JSZip();
        for (const size of selectedSizes) {
          const sizeCanvas = document.createElement('canvas');
          sizeCanvas.width = size;
          sizeCanvas.height = size;
          const sizeCtx = sizeCanvas.getContext('2d')!;
          
          sizeCtx.imageSmoothingEnabled = true;
          sizeCtx.imageSmoothingQuality = 'high';
          
          // Multi-step downscaling
          let currentCanvas = document.createElement('canvas');
          currentCanvas.width = img.width;
          currentCanvas.height = img.height;
          currentCanvas.getContext('2d')!.drawImage(img, 0, 0);
          
          while (currentCanvas.width > size * 2) {
            const nextCanvas = document.createElement('canvas');
            nextCanvas.width = Math.floor(currentCanvas.width / 2);
            nextCanvas.height = Math.floor(currentCanvas.height / 2);
            const nextCtx = nextCanvas.getContext('2d')!;
            nextCtx.imageSmoothingEnabled = true;
            nextCtx.imageSmoothingQuality = 'high';
            nextCtx.drawImage(currentCanvas, 0, 0, nextCanvas.width, nextCanvas.height);
            currentCanvas = nextCanvas;
          }
          
          const scale = Math.min(size / currentCanvas.width, size / currentCanvas.height);
          const x = (size - currentCanvas.width * scale) / 2;
          const y = (size - currentCanvas.height * scale) / 2;
          
          sizeCtx.drawImage(currentCanvas, x, y, currentCanvas.width * scale, currentCanvas.height * scale);
          
          const blob = await new Promise<Blob>((resolve) => sizeCanvas.toBlob((b) => resolve(b!), 'image/png'));
          zip.file(`icon_${size}x${size}.png`, blob);
        }
        finalBlob = await zip.generateAsync({ type: 'blob' });
        filename = 'icons_png.zip';
      } else if (format === 'WEBSITE') {
        const zip = new JSZip();
        
        const addToZip = async (size: number, name: string) => {
          const sizeCanvas = document.createElement('canvas');
          sizeCanvas.width = size;
          sizeCanvas.height = size;
          const sizeCtx = sizeCanvas.getContext('2d')!;
          sizeCtx.imageSmoothingEnabled = true;
          sizeCtx.imageSmoothingQuality = 'high';
          
          let currentCanvas = document.createElement('canvas');
          currentCanvas.width = img.width;
          currentCanvas.height = img.height;
          currentCanvas.getContext('2d')!.drawImage(img, 0, 0);
          
          while (currentCanvas.width > size * 2) {
            const nextCanvas = document.createElement('canvas');
            nextCanvas.width = Math.floor(currentCanvas.width / 2);
            nextCanvas.height = Math.floor(currentCanvas.height / 2);
            const nextCtx = nextCanvas.getContext('2d')!;
            nextCtx.imageSmoothingEnabled = true;
            nextCtx.imageSmoothingQuality = 'high';
            nextCtx.drawImage(currentCanvas, 0, 0, nextCanvas.width, nextCanvas.height);
            currentCanvas = nextCanvas;
          }
          
          const scale = Math.min(size / currentCanvas.width, size / currentCanvas.height);
          const x = (size - currentCanvas.width * scale) / 2;
          const y = (size - currentCanvas.height * scale) / 2;
          sizeCtx.drawImage(currentCanvas, x, y, currentCanvas.width * scale, currentCanvas.height * scale);
          
          const blob = await new Promise<Blob>((resolve) => sizeCanvas.toBlob((b) => resolve(b!), 'image/png'));
          zip.file(name, blob);
          return blob;
        };

        const fav16 = await addToZip(16, 'favicon-16x16.png');
        const fav32 = await addToZip(32, 'favicon-32x32.png');
        await addToZip(180, 'apple-touch-icon.png');
        await addToZip(192, 'android-chrome-192x192.png');
        await addToZip(512, 'android-chrome-512x512.png');
        
        const icoBlobs = [fav16, fav32];
        const icoSizes = [16, 32];
        const faviconIco = await createIco(icoBlobs, icoSizes);
        zip.file('favicon.ico', faviconIco);
        
        const manifest = {
          name: "My Website",
          short_name: "Website",
          icons: [
            { src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
            { src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" }
          ],
          theme_color: "#ffffff",
          background_color: "#ffffff",
          display: "standalone"
        };
        zip.file('site.webmanifest', JSON.stringify(manifest, null, 2));
        
        const instructions = `
<!-- Add these to your <head> section -->
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="shortcut icon" href="/favicon.ico">
        `;
        zip.file('instructions.txt', instructions);

        finalBlob = await zip.generateAsync({ type: 'blob' });
        filename = 'website_icons.zip';
      } else {
        canvas.width = 512;
        canvas.height = 512;
        ctx.clearRect(0, 0, 512, 512);
        
        const scale = Math.min(512 / img.width, 512 / img.height);
        const x = (512 - img.width * scale) / 2;
        const y = (512 - img.height * scale) / 2;
        
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
        
        finalBlob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
        filename = `icon.${format.toLowerCase()}`;
      }

      const url = URL.createObjectURL(finalBlob);
      setGeneratedBlob(finalBlob);
      
      // For ICO/ZIP, we need a separate preview URL that browsers can display
      if (format === 'ICO' || format === 'PNG') {
        const previewCanvas = document.createElement('canvas');
        previewCanvas.width = 256;
        previewCanvas.height = 256;
        const pCtx = previewCanvas.getContext('2d')!;
        const pScale = Math.min(256 / img.width, 256 / img.height);
        const px = (256 - img.width * pScale) / 2;
        const py = (256 - img.height * pScale) / 2;
        pCtx.imageSmoothingEnabled = true;
        pCtx.imageSmoothingQuality = 'high';
        pCtx.drawImage(img, px, py, img.width * pScale, img.height * pScale);
        setGeneratedUrl(previewCanvas.toDataURL('image/png'));
      } else {
        setGeneratedUrl(url);
      }
      
      downloadBlob(finalBlob, filename);

      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
      speak('Conversion complete. Your high-quality icon is ready for download.');
      toast.success('Conversion successful!');

      // Reset after a short delay to allow the user to see the success state
      setTimeout(() => {
        setFile(null);
        setPreview(null);
        setGeneratedUrl(null);
        setGeneratedBlob(null);
        speak('Ready for next icon. Select another file.');
      }, 3000);
    } catch (error) {
      console.error(error);
      toast.error('Conversion failed');
      speak('Sorry, conversion failed.');
    } finally {
      setIsConverting(false);
    }
  };

  const convertToIcon = async () => {
    if (!file || !preview) return;
    autoConvert(file, preview);
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const installPwa = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#F8FAFC] text-[#1E293B] font-sans overflow-hidden">
      <Toaster position="top-center" />
      
      {/* Header */}
      <header className="h-20 bg-white border-b-2 border-[#E2E8F0] flex items-center justify-between px-10 shrink-0">
        <div className="flex items-center gap-3 font-black text-2xl tracking-tighter uppercase">
          <div className="w-10 h-10 bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-200">
            <Layers size={22} />
          </div>
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#1E293B] to-[#2563EB]">
            PNG TO ICON
          </span>
        </div>
        
        <nav className="hidden md:flex items-center gap-8 text-sm font-semibold">
          <button onClick={() => speak('Navigating to Home')} className="text-[#2563EB]">Home</button>
          <button onClick={() => speak('Navigating to My Icons')} className="text-[#64748B] hover:text-[#1E293B] transition-colors">My Icons</button>
          <button onClick={() => speak('Navigating to Help')} className="text-[#64748B] hover:text-[#1E293B] transition-colors">Help</button>
          <div className="h-6 w-px bg-[#E2E8F0]" />
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => {
              const newState = !voiceEnabled;
              setVoiceEnabled(newState);
              // Use a small timeout to ensure the state update is reflected if needed, 
              // but speak directly with the new state intent
              if (newState) {
                // We can't easily speak "Voice enabled" if it was just enabled because the synthesis might not be ready,
                // but the hook handles the enabled check.
                // Actually, the speak function in useVoice checks `enabled`.
                // So I'll just call it.
                setTimeout(() => speak("Voice enabled"), 50);
              } else {
                speak("Voice disabled");
              }
            }}
            className="text-[#64748B]"
          >
            {voiceEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </Button>
        </nav>
        <div className="md:hidden">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => {
              setVoiceEnabled(!voiceEnabled);
              speak(voiceEnabled ? "Voice disabled" : "Voice enabled");
            }}
          >
            {voiceEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 p-4 md:p-8 bg-transparent overflow-y-auto lg:overflow-hidden relative z-10">
        {/* Left Column: Editor */}
        <div className="flex flex-col gap-6 h-full">
          {/* Hero Section */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110 duration-500" />
            <h2 className="text-3xl font-black text-[#1E293B] mb-3 tracking-tight uppercase leading-tight">
              CONVERT PNG TO <span className="text-[#2563EB]">PROFESSIONAL ICONS</span>
            </h2>
            <p className="text-[#64748B] max-w-2xl text-lg leading-relaxed">
              Upload your PNG image and instantly generate high-quality .ICO files, PNG icon packs, or a complete Website Icon Set including manifests and instructions.
            </p>
          </div>

          {/* Drop Zone */}
          <section 
            className={`flex-1 relative bg-white border-3 border-dashed border-[#CBD5E1] rounded-xl flex flex-col items-center justify-center transition-all duration-300 group ${file ? 'border-[#2563EB]' : 'hover:border-[#2563EB]'}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
          <AnimatePresence mode="wait">
            {!preview ? (
              <motion.div 
                key="upload"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center text-center"
              >
                <div className="w-16 h-16 bg-[#EFF6FF] rounded-full flex items-center justify-center mb-5 text-[#2563EB] group-hover:scale-110 transition-transform">
                  <Upload size={32} />
                </div>
                <h2 className="text-xl font-bold text-[#334155] mb-2">Drag your PNG file here</h2>
                <p className="text-sm text-[#64748B] mb-6">Max size: 10 MB (2048x2048px)</p>
                <Button 
                  onClick={() => {
                    fileInputRef.current?.click();
                    speak('Select a PNG file from your device');
                  }} 
                  className="bg-[#2563EB] hover:bg-blue-700"
                >
                  Select File
                </Button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept="image/png" 
                  className="hidden" 
                />
              </motion.div>
            ) : (
              <motion.div 
                key="preview"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center w-full h-full p-10"
              >
                <div className="relative group/preview flex-1 flex items-center justify-center w-full">
                  <img 
                    src={generatedUrl || preview} 
                    alt="Preview" 
                    className="max-w-full max-h-full object-contain rounded-lg shadow-xl"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/preview:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                    <Button variant="secondary" onClick={() => { 
                      setFile(null); 
                      setPreview(null); 
                      speak('Image cleared. You can upload a new one.');
                    }}>
                      Change Image
                    </Button>
                  </div>
                </div>
                <div className="mt-6 flex flex-col items-center gap-4">
                  <p className="font-bold text-[#1E293B]">{file?.name}</p>
                  <p className="text-xs text-[#64748B]">{(file!.size / 1024).toFixed(1)} KB</p>
                  
                  {generatedUrl && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex gap-3"
                    >
                      <Button 
                        onClick={() => {
                          if (generatedBlob) downloadBlob(generatedBlob, 'icon.ico');
                          speak('Downloading your high quality icon');
                        }}
                        className="bg-[#22C55E] hover:bg-green-600 text-white font-bold h-12 px-8 shadow-lg shadow-green-100"
                      >
                        <Download className="w-5 h-5 mr-2" />
                        Download Icon
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={() => {
                          setFile(null);
                          setPreview(null);
                          setGeneratedUrl(null);
                          speak('Ready for next icon');
                        }}
                        className="border-[#E2E8F0] text-[#64748B] hover:bg-white"
                      >
                        New Upload
                      </Button>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Features Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-auto">
          {[
            { title: 'Multi-Format', desc: 'Convert to ICO, PNG, or complete Website sets.', icon: <Layers size={20} /> },
            { title: 'High Quality', desc: 'Advanced downscaling for sharp, clear icons.', icon: <Settings size={20} /> },
            { title: 'PWA Ready', desc: 'Includes manifest and icons for web apps.', icon: <Download size={20} /> }
          ].map((feature, i) => (
            <div key={i} className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300">
              <div className="w-10 h-10 bg-blue-50 text-[#2563EB] rounded-lg flex items-center justify-center mb-3">
                {feature.icon}
              </div>
              <h3 className="font-bold text-[#1E293B] mb-1">{feature.title}</h3>
              <p className="text-sm text-[#64748B]">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Settings Panel */}
        <aside className="bg-white border border-[#E2E8F0] rounded-xl p-6 flex flex-col gap-6 shadow-sm overflow-y-auto">
          <div className="space-y-4">
            <Label className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Output Format</Label>
            <div className="grid grid-cols-3 gap-2">
              {(['ICO', 'PNG', 'WEBSITE'] as Format[]).map((f) => (
                <button
                  key={f}
                  onClick={() => {
                    setFormat(f);
                    speak(`Format changed to ${f}`);
                  }}
                  className={`px-3 py-2 rounded-lg text-[12px] font-bold border transition-all ${
                    format === f
                      ? 'bg-[#2563EB] text-white border-[#2563EB]'
                      : 'bg-[#F1F5F9] text-[#475569] border-transparent hover:border-[#2563EB]'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <Label className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Select Sizes</Label>
            <div className="flex flex-wrap gap-2">
              {[16, 32, 48, 64, 128, 256, 512, 1024].map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    const newSizes = selectedSizes.includes(s)
                      ? selectedSizes.filter(size => size !== s)
                      : [...selectedSizes, s];
                    if (newSizes.length === 0) {
                      toast.error("Select at least one size");
                      speak("Please select at least one size");
                      return;
                    }
                    setSelectedSizes(newSizes);
                    speak(`Size ${s} ${selectedSizes.includes(s) ? 'removed' : 'added'}`);
                  }}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-bold border transition-all ${
                    selectedSizes.includes(s)
                      ? 'bg-[#2563EB] text-white border-[#2563EB]'
                      : 'bg-[#F1F5F9] text-[#475569] border-transparent hover:border-[#2563EB]'
                  }`}
                >
                  {s}x{s}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-auto pt-6 border-t border-[#F1F5F9]">
            <Button 
              className="w-full h-14 text-base font-bold bg-[#2563EB] hover:bg-blue-700 shadow-lg shadow-blue-200"
              disabled={!file || isConverting}
              onClick={() => {
                convertToIcon();
                speak('Re-generating icon with current sizes');
              }}
            >
              {isConverting ? (
                <span className="flex items-center gap-2">
                  <motion.div 
                    animate={{ rotate: 360 }} 
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  >
                    <Settings size={18} />
                  </motion.div>
                  Converting...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Download size={18} />
                  Generate Again
                </span>
              )}
            </Button>
          </div>
        </aside>
      </main>

      {/* Footer / PWA Status */}
      <footer className="h-auto py-6 md:h-[100px] bg-[#1E293B] text-white flex flex-col md:flex-row items-center justify-between px-6 md:px-10 shrink-0 gap-4">
        <div className="flex items-center gap-4">
          <div className={`w-3 h-3 rounded-full ${isPwaInstalled ? 'bg-[#22C55E] shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]'}`} />
          <div className="text-center md:text-left">
            <h4 className="text-sm font-bold">
              {isPwaInstalled ? 'PWA Mode Active' : 'PWA Available'}
            </h4>
            <p className="text-[12px] opacity-70">
              {isPwaInstalled ? 'This app is available offline.' : 'Install for a better experience.'}
            </p>
          </div>
        </div>

        {deferredPrompt && (
          <Button 
            onClick={() => {
              installPwa();
              speak('Starting app installation');
            }}
            className="bg-white text-[#1E293B] hover:bg-slate-100 font-bold text-[13px] h-10 px-6 w-full md:w-auto"
          >
            <PwaIcon size={14} className="mr-2" />
            Download PWA App
          </Button>
        )}
      </footer>
    </div>
  );
}
