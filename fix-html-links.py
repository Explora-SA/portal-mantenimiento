#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script para corregir rutas de navegación en portal-mantenimiento
Reemplaza referencias relativas y absolutas por URLs correctas de GitHub Pages

Uso: python3 fix-html-links.py
"""

import os
import re
from pathlib import Path

class LinkFixer:
    def __init__(self):
        self.base_url = 'https://explora-sa.github.io/portal-mantenimiento/'
        self.html_files = [
            'index.html',
            'portal.html',
            'operadores.html',
            'solicitudes_trabajo_v2.html',
            'Dashboard_Activos.html',
            'Dashboard_Gestion_del_Mantenimiento.html',
            'Dashboard_Logistica.html',
            'Dashboard_Preventivos_Mecanicos.html',
            'Dashboard_Preventivos_Electricos.html',
            'Planificador_v3.html',
            'Vibraciones_Final_Historico.html'
        ]
        
        self.replacements = [
            # Rutas relativas con punto-slash
            (r'href\s*=\s*["\']\.\/Dashboard_Activos\.html["\']',
             'href="./Dashboard_Activos.html"'),
            (r'href\s*=\s*["\']\.\/Dashboard_Gestion_del_Mantenimiento\.html["\']',
             'href="./Dashboard_Gestion_del_Mantenimiento.html"'),
            (r'href\s*=\s*["\']\.\/Dashboard_Logistica\.html["\']',
             'href="./Dashboard_Logistica.html"'),
            (r'href\s*=\s*["\']\.\/Dashboard_Preventivos_Mecanicos\.html["\']',
             'href="./Dashboard_Preventivos_Mecanicos.html"'),
            (r'href\s*=\s*["\']\.\/Dashboard_Preventivos_Electricos\.html["\']',
             'href="./Dashboard_Preventivos_Electricos.html"'),
            (r'href\s*=\s*["\']\.\/portal\.html["\']',
             'href="./portal.html"'),
            (r'href\s*=\s*["\']\.\/index\.html["\']',
             'href="./index.html"'),
            (r'href\s*=\s*["\']\.\/operadores\.html["\']',
             'href="./operadores.html"'),
            (r'href\s*=\s*["\']\.\/Planificador_v3\.html["\']',
             'href="./Planificador_v3.html"'),
            (r'href\s*=\s*["\']\.\/Vibraciones_Final_Historico\.html["\']',
             'href="./Vibraciones_Final_Historico.html"'),
            (r'href\s*=\s*["\']\.\/solicitudes_trabajo_v2\.html["\']',
             'href="./solicitudes_trabajo_v2.html"'),
            
            # Rutas sin punto-slash (agregar ./)
            (r'href\s*=\s*["\']Dashboard_Activos\.html["\']',
             'href="./Dashboard_Activos.html"'),
            (r'href\s*=\s*["\']Dashboard_Gestion_del_Mantenimiento\.html["\']',
             'href="./Dashboard_Gestion_del_Mantenimiento.html"'),
            (r'href\s*=\s*["\']Dashboard_Logistica\.html["\']',
             'href="./Dashboard_Logistica.html"'),
            (r'href\s*=\s*["\']Dashboard_Preventivos_Mecanicos\.html["\']',
             'href="./Dashboard_Preventivos_Mecanicos.html"'),
            (r'href\s*=\s*["\']Dashboard_Preventivos_Electricos\.html["\']',
             'href="./Dashboard_Preventivos_Electricos.html"'),
            (r'href\s*=\s*["\']portal\.html["\']',
             'href="./portal.html"'),
            (r'href\s*=\s*["\']operadores\.html["\']',
             'href="./operadores.html"'),
            (r'href\s*=\s*["\']Planificador_v3\.html["\']',
             'href="./Planificador_v3.html"'),
            (r'href\s*=\s*["\']Vibraciones_Final_Historico\.html["\']',
             'href="./Vibraciones_Final_Historico.html"'),
            (r'href\s*=\s*["\']solicitudes_trabajo_v2\.html["\']',
             'href="./solicitudes_trabajo_v2.html"'),
            
            # Rutas antiguas con /portal-mantenimiento/
            (r'/portal-mantenimiento/([^"\']+\.html)',
             r'./$1'),
            
            # window.location
            (r'window\.location\s*=\s*["\']([A-Za-z_0-9]+\.html)["\']',
             r'window.location = "./$1"'),
            (r'window\.location\.href\s*=\s*["\']([A-Za-z_0-9]+\.html)["\']',
             r'window.location.href = "./$1"'),
            
            # Protocolo incompleto
            (r'href\s*=\s*["\']//explora\.com/portal-mantenimiento/',
             'href="./')
        ]

    def read_file(self, file_path):
        """Lee un archivo HTML"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception as e:
            print(f"❌ Error leyendo {file_path}: {e}")
            return None

    def write_file(self, file_path, content):
        """Escribe un archivo HTML"""
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            return True
        except Exception as e:
            print(f"❌ Error escribiendo {file_path}: {e}")
            return False

    def fix_content(self, content):
        """Arregla todos los links en el contenido"""
        fixed = content
        change_count = 0

        for pattern, replacement in self.replacements:
            matches = re.findall(pattern, fixed)
            if matches:
                change_count += len(matches)
                fixed = re.sub(pattern, replacement, fixed)

        return fixed, change_count

    def run(self):
        """Ejecuta la reparación en todos los archivos"""
        print("\n🔧 Portal Mantenimiento - Link Fixer (Python)")
        print("=" * 50 + "\n")

        total_changes = 0
        success_count = 0
        fail_count = 0

        for file_name in self.html_files:
            file_path = Path(file_name)

            # Verificar que existe
            if not file_path.exists():
                print(f"⚠️  No existe: {file_name}")
                continue

            # Leer
            content = self.read_file(str(file_path))
            if not content:
                fail_count += 1
                continue

            # Arreglar
            fixed, change_count = self.fix_content(content)

            if change_count == 0:
                print(f"✓ {file_name} - sin cambios (ya está OK)")
                success_count += 1
                continue

            # Escribir
            if self.write_file(str(file_path), fixed):
                print(f"✅ {file_name} - {change_count} links arreglados")
                total_changes += change_count
                success_count += 1
            else:
                print(f"❌ {file_name} - Error al escribir")
                fail_count += 1

        # Resumen
        print("\n" + "=" * 50)
        print("📊 Resumen:")
        print(f"   ✅ Exitosos: {success_count}/{len(self.html_files)}")
        print(f"   ❌ Errores: {fail_count}/{len(self.html_files)}")
        print(f"   🔗 Total de links arreglados: {total_changes}")
        print(f"   📍 Base URL: {self.base_url}")
        print("\n💡 Próximo paso: Hacer push a GitHub\n")

        return success_count == len(self.html_files)


if __name__ == "__main__":
    fixer = LinkFixer()
    success = fixer.run()
    exit(0 if success else 1)
