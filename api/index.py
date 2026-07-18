import sys
import os

# Add the ecoplate directory to python path so relative imports work
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'ecoplate'))

from app import app

# Vercel needs 'app' to be exposed at module level
