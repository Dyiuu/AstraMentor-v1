import { Button } from "../../components/ui/button";
import { Brain, Network, Sparkles, ArrowRight, FileUp } from "lucide-react";
import React from 'react';
import StarBackground from './StarBackground';

interface HomePageProps {
  onStart: () => void;
  onUploadDoc?: () => void;
}

export default function HomePage({ onStart, onUploadDoc }: HomePageProps) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col relative overflow-hidden">
        {/* Background Gradients/Blobs - using existing tailwind colors but with opacity */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-500/10 rounded-full blur-[120px]" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-cyan-500/10 rounded-full blur-[120px]" />
        </div>
        <StarBackground />

      {/* Navbar / Header */}
      <header className="w-full p-6 flex justify-between items-center z-10">
        <div className="flex items-center gap-3">
            <img src="/logo.png" alt="AstraMentor Logo" className="w-16 h-16 object-contain" />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
                AstraMentor
            </h1>
        </div>
        
        <Button onClick={onStart} variant="outline" className="hidden sm:flex border-blue-200 hover:border-blue-400 hover:bg-blue-50 text-blue-700">
            Try for Free
        </Button>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center z-10 pb-20">
        <div className="max-w-4xl space-y-8 animate-in fade-in zoom-in duration-700 slide-in-from-bottom-8">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-600 text-sm font-medium shadow-sm hover:shadow-md transition-shadow">
                <Sparkles className="w-4 h-4" />
                <span>AI-Powered Personal Tutor</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-slate-900 leading-[1.1]">
                Master AI Knowledge with
                <span className="block mt-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 bg-clip-text text-transparent pb-2">
                    Intelligent Guidance
                </span>
            </h1>
            
            <p className="text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
                Transform the way you learn. AstraMentor generates personalized knowledge graphs, 
                interactive study plans, and real-time AI tutoring to help you conquer AI concepts faster.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8 items-center">
                <Button 
                    size="lg" 
                    onClick={onStart} 
                    className="h-14 px-8 text-lg rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-xl shadow-blue-200 hover:shadow-2xl hover:shadow-blue-300 transition-all hover:-translate-y-1"
                >
                    Start Learning Now
                    <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
                {onUploadDoc && (
                  <Button 
                      size="lg" 
                      onClick={onUploadDoc} 
                      variant="outline"
                      className="h-14 px-8 text-lg rounded-full border-purple-300 text-purple-700 hover:bg-purple-50 hover:border-purple-400 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1"
                  >
                      <FileUp className="mr-2 w-5 h-5" />
                      Upload Document
                  </Button>
                )}
            </div>
        </div>

        {/* Features Grid */}
        <div id="features" className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl w-full px-4">
            <FeatureCard 
                icon={<Network className="w-6 h-6 text-blue-600" />}
                title="Knowledge Graphs"
                description="Visualize complex topics as interactive nodes. Understand relationships and prerequisites at a glance."
                delay="0ms"
            />
            <FeatureCard 
                icon={<Brain className="w-6 h-6 text-indigo-600" />}
                title="AI Tutoring"
                description="Chat with an advanced AI that understands your learning style. Get instant explanations and examples."
                delay="100ms"
            />
            <FeatureCard 
                icon={<Sparkles className="w-6 h-6 text-cyan-600" />}
                title="Personalized Plans"
                description="Get custom-tailored study paths based on your goals and current knowledge level."
                delay="200ms"
            />
        </div>
      </main>
      
      <footer className="w-full py-6 text-center text-sm text-muted-foreground border-t bg-slate-50">
        <p>&copy; {new Date().getFullYear()} AstraMentor. Built for the future of learning.</p>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description, delay }: { icon: React.ReactNode, title: string, description: string, delay: string }) {
    return (
        <div 
            className="group p-6 rounded-2xl bg-white border border-slate-100 hover:border-blue-100 transition-all duration-300 hover:-translate-y-1 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 animate-in fade-in slide-in-from-bottom-4 fill-mode-backwards text-left"
            style={{ animationDelay: delay }}
        >
            <div className="mb-4 p-3 bg-blue-50/50 rounded-xl w-fit group-hover:bg-blue-50 transition-colors duration-300">
                {icon}
            </div>
            <h3 className="text-lg font-bold mb-2 text-slate-800">{title}</h3>
            <p className="text-slate-600 leading-relaxed text-sm">
                {description}
            </p>
        </div>
    );
}
